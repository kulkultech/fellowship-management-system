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

	org, err := orgRepo.Register(ctx, "alpha-org", "Alpha Org", "admin@alpha.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	open := time.Now()
	end := open.Add(30 * 24 * time.Hour)
	prog, err := progRepo.Create(ctx, &model.Program{
		ID:             uuid.New(),
		OrganizationID: org.ID,
		Slug:           "fellowship-2026",
		Name:           "Tech Fellowship 2026",
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
		Email:          "admin@alpha.test",
		Role:           "org_admin",
		OrganizationID: &org.ID,
	}

	// 1. Update program slug from fellowship-2026 -> fellowship-cohort-2026
	updatePayload := map[string]any{
		"slug":        "fellowship-cohort-2026",
		"name":        "Tech Scholarship Cohort 2026",
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
	if updated.Slug != "fellowship-cohort-2026" {
		t.Errorf("expected slug 'fellowship-cohort-2026', got '%s'", updated.Slug)
	}
	if updated.Name != "Tech Scholarship Cohort 2026" {
		t.Errorf("expected name 'Tech Scholarship Cohort 2026', got '%s'", updated.Name)
	}
}

func TestAdminHandler_UpdateProgramRubric_AcceptsNameAndInstructions(t *testing.T) {
	h, progRepo, orgRepo := newAdminProgramSlugTestHandler()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "acme", "Acme Corp", "admin@acme.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	prog, err := progRepo.Create(ctx, &model.Program{
		ID:             uuid.New(),
		OrganizationID: org.ID,
		Slug:           "acme-fellowship",
		Name:           "Acme Fellowship",
		OpenDate:       time.Now(),
		EndDate:        time.Now().Add(10 * 24 * time.Hour),
		Status:         "published",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	claims := &auth.Claims{
		UserID:         uuid.New(),
		Email:          "admin@acme.test",
		Role:           "org_admin",
		OrganizationID: &org.ID,
	}

	// Payload containing name, instructions, total_points (which previously failed with json: unknown field "name")
	rubricPayload := map[string]any{
		"name":                     "Acme AI Interview Rubric",
		"instructions":             "Review candidate responses thoroughly",
		"scoring_guideline":        "Standard guideline",
		"preparation_time_seconds": 60,
		"response_time_seconds":    90,
		"allow_rerecord":          false,
		"total_points":             100,
		"questions": []map[string]any{
			{
				"id":         1,
				"theme":      "Introduction",
				"question":   "Please introduce yourself.",
				"max_points": 15,
				"criteria": []map[string]any{
					{"id": "q1_c1", "criterion": "Clear introduction", "points": 15},
				},
			},
		},
	}
	body, _ := json.Marshal(rubricPayload)

	r := chi.NewRouter()
	r.Put("/programs/{id}/rubric", h.UpdateProgramRubric)

	req := httptest.NewRequest(http.MethodPut, "/programs/"+prog.ID.String()+"/rubric", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithUser(req.Context(), claims))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	updated, err := progRepo.GetByID(ctx, prog.ID)
	if err != nil {
		t.Fatalf("failed to get program: %v", err)
	}
	if updated.AIInterviewRubric == nil {
		t.Fatalf("expected rubric to be saved, but was nil")
	}
	if updated.AIInterviewRubric.Name != "Acme AI Interview Rubric" {
		t.Errorf("expected rubric name 'Acme AI Interview Rubric', got '%s'", updated.AIInterviewRubric.Name)
	}
}
