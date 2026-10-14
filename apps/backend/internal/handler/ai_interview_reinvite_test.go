package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestReinviteAIInterview(t *testing.T) {
	ctx := context.Background()
	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	aiRepo := repository.NewAIInterviewRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)

	adminHandler := handler.NewAdminHandler(
		appRepo,
		repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil),
		repository.NewQuestionSetRepository(nil),
		trackRepo,
		aiRepo,
		progRepo,
		orgRepo,
		repository.NewUserRepository(nil),
		nil,
		"https://example.test",
	)

	org, _ := orgRepo.Register(ctx, "reinvite-org", "Reinvite Org", "admin@reinvite.test", "", model.OrgStatusApproved)
	otherOrg, _ := orgRepo.Register(ctx, "reinvite-other", "Other Org", "admin@other.test", "", model.OrgStatusApproved)
	prog, _ := progRepo.Create(ctx, &model.Program{
		ID: uuid.New(), OrganizationID: org.ID, Name: "Reinvite Program", Slug: "reinvite",
		OpenDate: time.Now(), EndDate: time.Now().Add(24 * time.Hour), Status: "published",
	})

	newApplicant := func(email string, stage model.ApplicantStage) *model.Applicant {
		a, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
			OrganizationID: org.ID, ProgramID: prog.ID, Email: email, FullName: email, CurrentStage: stage,
		})
		if err != nil {
			t.Fatalf("failed to create applicant: %v", err)
		}
		return a
	}

	// Candidate who completed the interview but whose video never arrived
	cand := newApplicant("cand@reinvite.test", model.StageAIInterviewCompleted)
	interview, err := aiRepo.CreateInvitationWithTrack(ctx, cand.ID, prog.ID, nil, "reinvite-token", time.Now().Add(-time.Hour))
	if err != nil {
		t.Fatalf("failed to create interview: %v", err)
	}
	started := time.Now().Add(-30 * time.Minute)
	completed := time.Now().Add(-5 * time.Minute)
	transcript := []model.ChatMessage{{Role: "ai", Message: "Q1"}, {Role: "candidate", Message: "A1"}}
	if err := aiRepo.UpdateSession(ctx, interview.ID, &started, &completed, transcript, &model.EvaluationSummary{OverallScore: 72}, 72, model.AIInterviewCompleted); err != nil {
		t.Fatalf("failed to complete interview: %v", err)
	}

	adminClaims := &auth.Claims{UserID: uuid.New(), Email: "admin@reinvite.test", Role: model.RoleOrgAdmin, OrganizationID: &org.ID}
	otherClaims := &auth.Claims{UserID: uuid.New(), Email: "admin@other.test", Role: model.RoleOrgAdmin, OrganizationID: &otherOrg.ID}

	reinvite := func(claims *auth.Claims, applicantID uuid.UUID, body any) *httptest.ResponseRecorder {
		r := chi.NewRouter()
		r.Post("/applicants/{id}/reinvite-ai-interview", adminHandler.ReinviteAIInterview)
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(http.MethodPost, "/applicants/"+applicantID.String()+"/reinvite-ai-interview", &buf)
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// Admins of another organization cannot re-invite
	if w := reinvite(otherClaims, cand.ID, nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}

	// Re-invite archives the previous take and resets the same interview link
	if w := reinvite(adminClaims, cand.ID, map[string]string{"reason": "Recording failed to upload"}); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	reset, err := aiRepo.GetByToken(ctx, "reinvite-token")
	if err != nil {
		t.Fatalf("interview should still exist under the same link: %v", err)
	}
	if reset.Status != model.AIInterviewInvited || len(reset.Transcript) != 0 || reset.ScorecardScore != 0 || reset.CompletedAt != nil {
		t.Fatalf("expected a fresh interview, got %+v", reset)
	}
	if !reset.InvitationExpiresAt.After(time.Now().Add(6 * 24 * time.Hour)) {
		t.Fatalf("expected the invitation to be extended, got %v", reset.InvitationExpiresAt)
	}
	attempts, _ := aiRepo.ListAttempts(ctx, cand.ID)
	if len(attempts) != 1 || attempts[0].ScorecardScore != 72 || len(attempts[0].Transcript) != 2 || attempts[0].Reason != "Recording failed to upload" {
		t.Fatalf("expected the previous attempt to be archived, got %+v", attempts)
	}
	updated, _ := appRepo.GetByID(ctx, cand.ID)
	if updated.CurrentStage != model.StageAIInterviewInvited {
		t.Fatalf("expected stage ai_interview_invited, got %s", updated.CurrentStage)
	}

	// Re-inviting again before they start just extends the link; nothing new is archived
	if w := reinvite(adminClaims, cand.ID, nil); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if attempts, _ := aiRepo.ListAttempts(ctx, cand.ID); len(attempts) != 1 {
		t.Fatalf("expected still 1 archived attempt, got %d", len(attempts))
	}

	// Accepted fellows and candidates without an interview are refused
	accepted := newApplicant("accepted@reinvite.test", model.StageApprovedForLive)
	_, _ = aiRepo.CreateInvitationWithTrack(ctx, accepted.ID, prog.ID, nil, "accepted-token", time.Now().Add(time.Hour))
	if w := reinvite(adminClaims, accepted.ID, nil); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for accepted fellow, got %d", w.Code)
	}
	noInterview := newApplicant("none@reinvite.test", model.StageRegistered)
	if w := reinvite(adminClaims, noInterview.ID, nil); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without an interview, got %d", w.Code)
	}
}
