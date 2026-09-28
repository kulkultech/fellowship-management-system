package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/repository"
)

func TestAuthHandler_RegisterCompanyWithPasswordRequiresActivation(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "", "http://localhost:5173")

	payload := map[string]string{
		"company_name":   "Innovate Tech",
		"company_slug":   "innovate-tech",
		"contact_email":  "team@innovatetech.io",
		"admin_name":     "Innovate Founder",
		"admin_email":    "founder@innovatetech.io",
		"admin_password": "password123",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-company", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.RegisterCompany(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if reqAct, ok := resp["requires_activation"].(bool); !ok || !reqAct {
		t.Fatalf("expected requires_activation: true for email/password company registration, got %v", resp["requires_activation"])
	}

	// Verify in repository that user is created as org_admin and unverified
	user, err := userRepo.GetByEmail(context.Background(), "founder@innovatetech.io")
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}
	if user.Role != "org_admin" {
		t.Errorf("expected user.Role in DB to be 'org_admin', got %q", user.Role)
	}
	if user.EmailVerified {
		t.Errorf("expected user.EmailVerified to be false before activation")
	}
	if user.ActivationToken == nil || *user.ActivationToken == "" {
		t.Fatalf("expected activation token to be set")
	}
}

func TestAuthHandler_RegisterCompanyRequiresSuperadminApproval(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "", "http://localhost:5173")

	// Pre-create verified Google OAuth user
	pwdHash, _ := auth.HashPassword("password123")
	user, err := userRepo.Create(context.Background(), "google.admin@innovatetech.io", pwdHash, "Google Admin", "candidate", nil)
	if err != nil {
		t.Fatalf("failed to create pre-verified user: %v", err)
	}
	_ = userRepo.ActivateUser(context.Background(), user.ID)

	payload := map[string]string{
		"company_name":   "Google Linked Corp",
		"company_slug":   "google-linked",
		"contact_email":  "contact@innovatetech.io",
		"admin_name":     "Google Admin",
		"admin_email":    "google.admin@innovatetech.io",
		"admin_password": "password123",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-company", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.RegisterCompany(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["status"] != "pending_approval" {
		t.Errorf("expected status 'pending_approval', got %v", resp["status"])
	}
	if reqApp, ok := resp["requires_approval"].(bool); !ok || !reqApp {
		t.Errorf("expected requires_approval: true, got %v", resp["requires_approval"])
	}

	// Verify auth_token cookie was NOT set because approval is required first
	cookies := w.Result().Cookies()
	for _, c := range cookies {
		if c.Name == auth.AuthCookieName && c.Value != "" {
			t.Fatalf("expected auth_token cookie to NOT be set before superadmin approval")
		}
	}

	// Attempt login while pending approval: must be rejected with 403 Forbidden
	loginPayload := map[string]string{
		"email":    "google.admin@innovatetech.io",
		"password": "password123",
	}
	loginBody, _ := json.Marshal(loginPayload)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()

	h.Login(loginW, loginReq)
	if loginW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden before approval, got %d: %s", loginW.Code, loginW.Body.String())
	}

	// Superadmin approves company
	org, err := orgRepo.GetBySlug(context.Background(), "google-linked")
	if err != nil {
		t.Fatalf("failed to get registered org: %v", err)
	}
	if _, err := orgRepo.UpdateStatus(context.Background(), org.ID, "approved"); err != nil {
		t.Fatalf("failed to approve org: %v", err)
	}

	// Attempt login after approval: must succeed with 200 OK and auth cookie
	approvedLoginW := httptest.NewRecorder()
	approvedLoginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	approvedLoginReq.Header.Set("Content-Type", "application/json")
	h.Login(approvedLoginW, approvedLoginReq)

	if approvedLoginW.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK after approval, got %d: %s", approvedLoginW.Code, approvedLoginW.Body.String())
	}

	var hasAuthCookie bool
	for _, c := range approvedLoginW.Result().Cookies() {
		if c.Name == auth.AuthCookieName && c.Value != "" {
			hasAuthCookie = true
			break
		}
	}
	if !hasAuthCookie {
		t.Fatalf("expected auth_token cookie to be set after approval")
	}
}
