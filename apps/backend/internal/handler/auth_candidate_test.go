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

func TestAuthHandler_CandidateRegistrationAndActivationFlow(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "", "http://localhost:5173")

	// 1. Register candidate with email and password
	payload := map[string]string{
		"name":     "Candidate Alex",
		"email":    "alex.candidate@example.com",
		"password": "securepassword123",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-candidate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.RegisterCandidate(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var regResp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &regResp); err != nil {
		t.Fatalf("failed to unmarshal registration response: %v", err)
	}
	if reqAct, ok := regResp["requires_activation"].(bool); !ok || !reqAct {
		t.Fatalf("expected requires_activation: true, got %v", regResp["requires_activation"])
	}

	// Verify candidate exists in repository and is unverified
	user, err := userRepo.GetByEmail(context.Background(), "alex.candidate@example.com")
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}
	if user.Role != "candidate" {
		t.Errorf("expected role 'candidate', got %q", user.Role)
	}
	if user.EmailVerified {
		t.Errorf("expected user.EmailVerified to be false before activation")
	}
	if user.ActivationToken == nil || *user.ActivationToken == "" {
		t.Fatalf("expected activation token to be set")
	}

	// 2. Attempt login before activation -> must be blocked with 403 and requires_activation: true
	loginPayload := map[string]string{
		"email":    "alex.candidate@example.com",
		"password": "securepassword123",
	}
	lBody, _ := json.Marshal(loginPayload)
	lReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(lBody))
	lReq.Header.Set("Content-Type", "application/json")
	lW := httptest.NewRecorder()

	h.Login(lW, lReq)

	if lW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden for unactivated user, got %d: %s", lW.Code, lW.Body.String())
	}

	// 3. Activate account using the activation token
	actPayload := map[string]string{
		"token": *user.ActivationToken,
	}
	actBody, _ := json.Marshal(actPayload)
	actReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/activate", bytes.NewReader(actBody))
	actReq.Header.Set("Content-Type", "application/json")
	actW := httptest.NewRecorder()

	h.ActivateAccount(actW, actReq)

	if actW.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for activation, got %d: %s", actW.Code, actW.Body.String())
	}

	// Verify cookie was set upon activation
	cookies := actW.Result().Cookies()
	var authCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.AuthCookieName {
			authCookie = c
			break
		}
	}
	if authCookie == nil || authCookie.Value == "" {
		t.Fatalf("expected auth_token cookie to be set upon account activation")
	}

	// Verify user is now verified in repository
	userAfter, err := userRepo.GetByEmail(context.Background(), "alex.candidate@example.com")
	if err != nil {
		t.Fatalf("failed to get user after activation: %v", err)
	}
	if !userAfter.EmailVerified {
		t.Errorf("expected user.EmailVerified to be true after activation")
	}

	// 4. Login after activation -> must succeed with 200 OK
	lReq2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(lBody))
	lReq2.Header.Set("Content-Type", "application/json")
	lW2 := httptest.NewRecorder()

	h.Login(lW2, lReq2)

	if lW2.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK for activated login, got %d: %s", lW2.Code, lW2.Body.String())
	}
}

func TestAuthHandler_RegisterCandidateValidation(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "", "http://localhost:5173")

	// 1. Password too short (< 6 characters)
	payloadShort := map[string]string{
		"name":     "Short Pass",
		"email":    "short@example.com",
		"password": "123",
	}
	b, _ := json.Marshal(payloadShort)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-candidate", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.RegisterCandidate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for short password, got %d", w.Code)
	}

	// 2. Duplicate registration with password
	payloadValid := map[string]string{
		"name":     "First Candidate",
		"email":    "first@example.com",
		"password": "validpassword123",
	}
	b, _ = json.Marshal(payloadValid)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-candidate", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	h.RegisterCandidate(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201 for first registration, got %d", w.Code)
	}

	// Duplicate
	reqDup := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-candidate", bytes.NewReader(b))
	reqDup.Header.Set("Content-Type", "application/json")
	wDup := httptest.NewRecorder()
	h.RegisterCandidate(wDup, reqDup)
	if wDup.Code != http.StatusConflict {
		t.Fatalf("expected status 409 Conflict for duplicate email, got %d", wDup.Code)
	}
}

func TestAuthHandler_ResendActivation(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "", "http://localhost:5173")

	payload := map[string]string{
		"name":     "Resend User",
		"email":    "resend@example.com",
		"password": "validpassword123",
	}
	b, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-candidate", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.RegisterCandidate(w, req)

	userBefore, _ := userRepo.GetByEmail(context.Background(), "resend@example.com")
	firstToken := *userBefore.ActivationToken

	// Resend activation
	resendPayload := map[string]string{"email": "resend@example.com"}
	rBody, _ := json.Marshal(resendPayload)
	rReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/resend-activation", bytes.NewReader(rBody))
	rReq.Header.Set("Content-Type", "application/json")
	rW := httptest.NewRecorder()

	h.ResendActivation(rW, rReq)
	if rW.Code != http.StatusOK {
		t.Fatalf("expected status 200 for resend activation, got %d: %s", rW.Code, rW.Body.String())
	}

	userAfter, _ := userRepo.GetByEmail(context.Background(), "resend@example.com")
	if userAfter.ActivationToken == nil || *userAfter.ActivationToken == firstToken {
		t.Fatalf("expected a newly generated activation token after resend")
	}
}
