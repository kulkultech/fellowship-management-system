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

func TestAuthHandler_RegisterCompanySetsAuthCookiesAndOrgAdmin(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "")

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

	// Verify that auth_token cookie was set
	cookies := w.Result().Cookies()
	var authTokenCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.AuthCookieName {
			authTokenCookie = c
			break
		}
	}

	if authTokenCookie == nil || authTokenCookie.Value == "" {
		t.Fatalf("expected auth_token cookie to be set, but was missing")
	}

	// Validate the JWT claims in the cookie
	claims, err := authSvc.ValidateToken(authTokenCookie.Value)
	if err != nil {
		t.Fatalf("failed to validate token from cookie: %v", err)
	}

	if claims.Role != "org_admin" {
		t.Errorf("expected claims.Role == 'org_admin', got %q", claims.Role)
	}
	if claims.OrganizationID == nil {
		t.Errorf("expected claims.OrganizationID to be non-nil")
	}

	// Verify in repository
	user, err := userRepo.GetByEmail(context.Background(), "founder@innovatetech.io")
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}
	if user.Role != "org_admin" {
		t.Errorf("expected user.Role in DB to be 'org_admin', got %q", user.Role)
	}
}
