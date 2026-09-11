package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func newAdminCompanyTestHandler() (*handler.AdminHandler, *repository.UserRepository, *repository.OrgRepository) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	h := handler.NewAdminHandler(
		repository.NewApplicantRepository(nil),
		repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil),
		repository.NewQuestionSetRepository(nil),
		repository.NewTrackRepository(nil),
		repository.NewAIInterviewRepository(nil),
		repository.NewProgramRepository(nil),
		orgRepo,
		userRepo,
		nil,
		"https://example.test",
	)
	return h, userRepo, orgRepo
}

func TestAdminHandler_UpdateOrganizationSlug(t *testing.T) {
	h, _, orgRepo := newAdminCompanyTestHandler()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "acme-corp", "Acme Corp", "admin@acme.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	payload := map[string]string{
		"name":          "Acme International",
		"slug":          "acme-intl",
		"contact_email": "hello@acme.test",
		"logo_url":      "https://example.com/logo.png",
	}
	body, _ := json.Marshal(payload)

	claims := &auth.Claims{
		UserID:         uuid.New(),
		Email:          "admin@acme.test",
		Role:           "org_admin",
		OrganizationID: &org.ID,
	}

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/organization", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithUser(req.Context(), claims))

	w := httptest.NewRecorder()
	h.UpdateOrganization(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify org was updated in repo
	updated, err := orgRepo.GetByID(ctx, org.ID)
	if err != nil {
		t.Fatalf("failed to retrieve org: %v", err)
	}
	if updated.Slug != "acme-intl" {
		t.Errorf("expected slug 'acme-intl', got '%s'", updated.Slug)
	}
	if updated.Name != "Acme International" {
		t.Errorf("expected name 'Acme International', got '%s'", updated.Name)
	}
}

func TestAdminHandler_UpdateCompanyDetails_Superadmin(t *testing.T) {
	h, _, orgRepo := newAdminCompanyTestHandler()
	ctx := context.Background()

	org1, err := orgRepo.Register(ctx, "company-one", "Company One", "c1@test.com", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org1: %v", err)
	}
	_, err = orgRepo.Register(ctx, "company-two", "Company Two", "c2@test.com", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org2: %v", err)
	}

	superClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "superadmin@kulkul.tech",
		Role:   "superadmin",
	}

	// 1. Successful slug update
	payload := map[string]string{
		"name": "Company One Global",
		"slug": "company-one-global",
	}
	body, _ := json.Marshal(payload)

	r := chi.NewRouter()
	r.Put("/companies/{id}", h.UpdateCompanyDetails)

	req := httptest.NewRequest(http.MethodPut, "/companies/"+org1.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithUser(req.Context(), superClaims))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// 2. Reject collision with company-two
	collidePayload := map[string]string{
		"name": "Company One Clashing",
		"slug": "company-two",
	}
	collideBody, _ := json.Marshal(collidePayload)

	collideReq := httptest.NewRequest(http.MethodPut, "/companies/"+org1.ID.String(), bytes.NewReader(collideBody))
	collideReq.Header.Set("Content-Type", "application/json")
	collideReq = collideReq.WithContext(middleware.WithUser(collideReq.Context(), superClaims))
	collideW := httptest.NewRecorder()
	r.ServeHTTP(collideW, collideReq)

	if collideW.Code != http.StatusConflict {
		t.Errorf("expected status 409 Conflict, got %d: %s", collideW.Code, collideW.Body.String())
	}
}
