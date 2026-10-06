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

func TestUpdateApplicantReview(t *testing.T) {
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

	ctx := context.Background()

	// 1. Create org and program
	org, err := orgRepo.Register(ctx, "test-org", "Test Org", "admin@test.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to create org: %v", err)
	}

	prog, err := progRepo.Create(ctx, &model.Program{
		OrganizationID: org.ID,
		Slug:           "fellowship-2026",
		Name:           "Fellowship 2026",
		Status:         "published",
		OpenDate:       time.Now().Add(-24 * time.Hour),
		EndDate:        time.Now().Add(30 * 24 * time.Hour),
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// 2. Create applicant
	app, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      prog.ID,
		Email:          "candidate@example.test",
		FullName:       "Candidate One",
		CurrentStage:   model.StageRegistered,
	})
	if err != nil {
		t.Fatalf("failed to create applicant: %v", err)
	}

	// Helper router setup
	r := chi.NewRouter()
	r.Put("/admin/applicants/{id}/review", adminHandler.UpdateApplicantReview)

	// Test 1: Unauthorized without claims
	t.Run("Unauthorized request", func(t *testing.T) {
		payload := map[string]any{
			"reviewer_mark":  88.5,
			"reviewer_notes": "Great logic and communication",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/admin/applicants/"+app.ID.String()+"/review", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
		}
	})

	// Test 2: Reviewer saves mark and notes successfully
	t.Run("Reviewer updates mark and notes", func(t *testing.T) {
		markVal := 95.0
		payload := map[string]any{
			"reviewer_mark":  markVal,
			"reviewer_notes": "Outstanding technical performance and strong leadership skills.",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/admin/applicants/"+app.ID.String()+"/review", bytes.NewReader(body))
		claims := &auth.Claims{
			UserID:         uuid.New(),
			Role:           "reviewer",
			OrganizationID: &org.ID,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
		}

		// Verify in repo
		updated, err := appRepo.GetByID(ctx, app.ID)
		if err != nil {
			t.Fatalf("failed to get applicant: %v", err)
		}
		if updated.ReviewerMark == nil || *updated.ReviewerMark != 95.0 {
			t.Errorf("expected reviewer mark 95.0, got %v", updated.ReviewerMark)
		}
		if updated.ReviewerNotes != "Outstanding technical performance and strong leadership skills." {
			t.Errorf("expected reviewer notes to match, got %q", updated.ReviewerNotes)
		}
		if updated.Notes != "Outstanding technical performance and strong leadership skills." {
			t.Errorf("expected notes to match, got %q", updated.Notes)
		}
	})

	// Test 3: Cross-tenant forbidden
	t.Run("Forbidden for another organization", func(t *testing.T) {
		otherOrgID := uuid.New()
		payload := map[string]any{
			"reviewer_mark":  70.0,
			"reviewer_notes": "Trying to modify other org",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/admin/applicants/"+app.ID.String()+"/review", bytes.NewReader(body))
		claims := &auth.Claims{
			UserID:         uuid.New(),
			Role:           "reviewer",
			OrganizationID: &otherOrgID,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected status %d, got %d", http.StatusForbidden, rec.Code)
		}
	})
}
