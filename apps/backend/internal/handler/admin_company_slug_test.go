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

func TestAdminHandler_DeleteCompany(t *testing.T) {
	h, _, orgRepo := newAdminCompanyTestHandler()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "delete-me", "Delete Me Corp", "del@test.com", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	superClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "superadmin@kulkul.tech",
		Role:   "superadmin",
	}

	orgAdminClaims := &auth.Claims{
		UserID:         uuid.New(),
		Email:          "admin@delete-me.test",
		Role:           "org_admin",
		OrganizationID: &org.ID,
	}

	r := chi.NewRouter()
	r.Delete("/companies/{id}", h.DeleteCompany)

	// 1. Non-superadmin cannot delete company
	forbiddenReq := httptest.NewRequest(http.MethodDelete, "/companies/"+org.ID.String(), nil)
	forbiddenReq = forbiddenReq.WithContext(middleware.WithUser(forbiddenReq.Context(), orgAdminClaims))
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, forbiddenReq)
	if w1.Code != http.StatusForbidden {
		t.Errorf("expected status 403 Forbidden, got %d", w1.Code)
	}

	// 2. Cannot delete primary system organization
	primaryID := "00000000-0000-0000-0000-000000000001"
	primaryReq := httptest.NewRequest(http.MethodDelete, "/companies/"+primaryID, nil)
	primaryReq = primaryReq.WithContext(middleware.WithUser(primaryReq.Context(), superClaims))
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, primaryReq)
	if w2.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 Bad Request for primary org, got %d", w2.Code)
	}

	// 3. Superadmin successfully deletes company
	successReq := httptest.NewRequest(http.MethodDelete, "/companies/"+org.ID.String(), nil)
	successReq = successReq.WithContext(middleware.WithUser(successReq.Context(), superClaims))
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, successReq)
	if w3.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d: %s", w3.Code, w3.Body.String())
	}

	// Verify org is deleted
	_, err = orgRepo.GetByID(ctx, org.ID)
	if err == nil {
		t.Errorf("expected deleted org to not be found, but it was found")
	}

	// 4. Deleting nonexistent company returns 404
	w4 := httptest.NewRecorder()
	r.ServeHTTP(w4, successReq)
	if w4.Code != http.StatusNotFound {
		t.Errorf("expected status 404 Not Found, got %d", w4.Code)
	}
}

func TestAdminHandler_UpdateCompanySlug_DoesNotDuplicate(t *testing.T) {
	h, _, orgRepo := newAdminCompanyTestHandler()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "beta-academy", "Beta Academy", "beta@test.com", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	superClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "superadmin@fellowhire.com",
		Role:   "superadmin",
	}

	r := chi.NewRouter()
	r.Put("/companies/{id}", h.UpdateCompanyDetails)

	// Update slug from beta-academy to beta-network
	payload := map[string]string{
		"name": "Beta Academy Network",
		"slug": "beta-network",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPut, "/companies/"+org.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithUser(req.Context(), superClaims))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify org count remains exactly 2 (rsa + beta-network, no duplicate company created)
	orgs, err := orgRepo.List(ctx, "")
	if err != nil {
		t.Fatalf("failed to list orgs: %v", err)
	}
	if len(orgs) != 2 {
		t.Errorf("expected exactly 2 orgs (rsa + beta-network), got %d", len(orgs))
	}

	// Old slug must no longer exist
	_, err = orgRepo.GetBySlug(ctx, "beta-academy")
	if err == nil {
		t.Errorf("expected old slug 'beta-academy' to be deleted from repo map, but it still exists")
	}

	// New slug must exist with the same org ID
	updatedOrg, err := orgRepo.GetBySlug(ctx, "beta-network")
	if err != nil {
		t.Fatalf("failed to get updated org by new slug: %v", err)
	}
	if updatedOrg.ID != org.ID {
		t.Errorf("expected updated org ID %s, got %s", org.ID, updatedOrg.ID)
	}
	if updatedOrg.Name != "Beta Academy Network" {
		t.Errorf("expected name 'Beta Academy Network', got '%s'", updatedOrg.Name)
	}
}


