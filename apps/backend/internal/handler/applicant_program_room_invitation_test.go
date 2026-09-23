package handler_test

import (
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

func TestInviteApplicantToProgramRoom(t *testing.T) {
	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	subRepo := repository.NewSubmissionRepository(nil)
	aiRepo := repository.NewAIInterviewRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	mcqRepo := repository.NewMCQRepository(nil)
	qsetRepo := repository.NewQuestionSetRepository(nil)
	userRepo := repository.NewUserRepository(nil)

	adminHandler := handler.NewAdminHandler(
		appRepo,
		subRepo,
		mcqRepo,
		qsetRepo,
		trackRepo,
		aiRepo,
		progRepo,
		orgRepo,
		userRepo,
		nil,
		"https://example.test",
	)

	candHandler := handler.NewCandidateHandler(
		orgRepo,
		progRepo,
		trackRepo,
		appRepo,
		subRepo,
		aiRepo,
	)

	ctx := context.Background()

	// Seed Org and Program
	org, err := orgRepo.Register(ctx, "kulkul", "KulKul Tech", "admin@kulkul.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	prog, err := progRepo.Create(ctx, &model.Program{
		ID:             uuid.New(),
		OrganizationID: org.ID,
		Name:           "KulKul Fellowship 2026",
		Slug:           "lit-2026",
		OpenDate:       time.Now(),
		EndDate:        time.Now().Add(30 * 24 * time.Hour),
		Status:         "published",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// Seed Candidate in test_in_progress stage
	candApplied, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      prog.ID,
		Email:          "pending@candidate.test",
		FullName:       "Pending Candidate",
		CurrentStage:   model.StageTestInProgress,
	})
	if err != nil {
		t.Fatalf("failed to create pending candidate: %v", err)
	}

	// Seed Candidate in approved_for_live stage
	candApproved, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      prog.ID,
		Email:          "accepted@candidate.test",
		FullName:       "Accepted Fellow",
		CurrentStage:   model.StageApprovedForLive,
	})
	if err != nil {
		t.Fatalf("failed to create accepted candidate: %v", err)
	}

	adminUserID := uuid.New()
	adminClaims := &auth.Claims{
		UserID:         adminUserID,
		Email:          "admin@kulkul.test",
		Role:           model.RoleOrgAdmin,
		OrganizationID: &org.ID,
	}

	superClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "super@platform.test",
		Role:   model.RoleSuperadmin,
	}

	// 1. Candidate in test_in_progress stage rejected from program room invite
	{
		r := chi.NewRouter()
		r.Post("/applicants/{id}/invite-program-room", adminHandler.InviteApplicantToProgramRoom)

		req := httptest.NewRequest(http.MethodPost, "/applicants/"+candApplied.ID.String()+"/invite-program-room", nil)
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for candidate not in approved_for_live stage, got %d", w.Code)
		}
	}

	// 2. Candidate in approved_for_live stage successfully invited
	{
		r := chi.NewRouter()
		r.Post("/applicants/{id}/invite-program-room", adminHandler.InviteApplicantToProgramRoom)

		req := httptest.NewRequest(http.MethodPost, "/applicants/"+candApproved.ID.String()+"/invite-program-room", nil)
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for accepted candidate invite, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse response: %v", err)
		}
		if resp["program_room_invited_at"] == nil || resp["program_room_invited_at"] == "" {
			t.Fatalf("expected non-empty program_room_invited_at, got %v", resp["program_room_invited_at"])
		}
	}

	// 3. Verify Candidate details in Admin Handler contains program_room_invited_at
	{
		r := chi.NewRouter()
		r.Get("/applicants/{id}", adminHandler.GetApplicantDetail)

		req := httptest.NewRequest(http.MethodGet, "/applicants/"+candApproved.ID.String(), nil)
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for applicant detail, got %d", w.Code)
		}

		var detailResp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &detailResp)
		applicantMap, ok := detailResp["applicant"].(map[string]any)
		if !ok {
			t.Fatalf("expected applicant object in detail response")
		}
		if applicantMap["program_room_invited_at"] == nil {
			t.Fatalf("expected program_room_invited_at to be populated in applicant detail")
		}
	}

	// 4. Verify Candidate portal applications returns next_step="program_room"
	{
		candidateClaims := &auth.Claims{
			UserID: candApproved.ID,
			Email:  candApproved.Email,
			Role:   model.RoleCandidate,
		}

		req := httptest.NewRequest(http.MethodGet, "/candidate/applications", nil)
		req = req.WithContext(middleware.WithUser(req.Context(), candidateClaims))
		w := httptest.NewRecorder()
		candHandler.GetCandidateApplications(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for candidate applications, got %d: %s", w.Code, w.Body.String())
		}

		var candResp struct {
			Applications []handler.CandidateApplicationItem `json:"applications"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &candResp); err != nil {
			t.Fatalf("failed to unmarshal candidate applications: %v", err)
		}
		if len(candResp.Applications) == 0 {
			t.Fatalf("expected at least 1 candidate application")
		}
		appItem := candResp.Applications[0]
		if appItem.NextStep != "program_room" {
			t.Errorf("expected next_step 'program_room', got '%s'", appItem.NextStep)
		}
		if appItem.ProgramRoomInvitedAt == nil {
			t.Errorf("expected program_room_invited_at to be non-nil in candidate application item")
		}
	}

	// 5. Superadmin can resend invite
	{
		time.Sleep(10 * time.Millisecond)
		r := chi.NewRouter()
		r.Post("/applicants/{id}/invite-program-room", adminHandler.InviteApplicantToProgramRoom)

		req := httptest.NewRequest(http.MethodPost, "/applicants/"+candApproved.ID.String()+"/invite-program-room", nil)
		req = req.WithContext(middleware.WithUser(req.Context(), superClaims))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for resend invite by superadmin, got %d", w.Code)
		}
	}
}
