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

func newAdminProgramSlugTestHandler() (*handler.AdminHandler, *repository.ProgramRepository, *repository.OrgRepository) {
	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	h := handler.NewAdminHandler(
		repository.NewApplicantRepository(nil),
		repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil),
		repository.NewQuestionSetRepository(nil),
		repository.NewTrackRepository(nil),
		repository.NewAIInterviewRepository(nil),
		progRepo,
		orgRepo,
		repository.NewUserRepository(nil),
		nil,
		"https://example.test",
	)
	return h, progRepo, orgRepo
}

func TestAdminHandler_UpdateProgramSlug(t *testing.T) {
	h, progRepo, orgRepo := newAdminProgramSlugTestHandler()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "lit-network", "LIT Network", "admin@lit.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	open := time.Now()
	end := open.Add(30 * 24 * time.Hour)
	prog, err := progRepo.Create(ctx, &model.Program{
		ID:             uuid.New(),
		OrganizationID: org.ID,
		Slug:           "lit2026",
		Name:           "LIT Fellowship 2026",
		Description:    "Original description",
		OpenDate:       open,
		EndDate:        end,
		Status:         "published",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	claims := &auth.Claims{
		UserID:         uuid.New(),
		Email:          "admin@lit.test",
		Role:           "org_admin",
		OrganizationID: &org.ID,
	}

	// 1. Update program slug from lit2026 -> lit-scholarship-2026
	updatePayload := map[string]any{
		"slug":        "lit-scholarship-2026",
		"name":        "LIT Scholarship Cohort 2026",
		"description": "Updated description",
	}
	body, _ := json.Marshal(updatePayload)

	r := chi.NewRouter()
	r.Put("/programs/{id}", h.UpdateProgramDetails)

	req := httptest.NewRequest(http.MethodPut, "/programs/"+prog.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithUser(req.Context(), claims))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify updated program in repo
	updated, err := progRepo.GetByID(ctx, prog.ID)
	if err != nil {
		t.Fatalf("failed to get updated program: %v", err)
	}
	if updated.Slug != "lit-scholarship-2026" {
		t.Errorf("expected slug 'lit-scholarship-2026', got '%s'", updated.Slug)
	}
	if updated.Name != "LIT Scholarship Cohort 2026" {
		t.Errorf("expected name 'LIT Scholarship Cohort 2026', got '%s'", updated.Name)
	}
}
