package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type mockEmailService struct {
	email.Service
	mu              sync.Mutex
	resetRecipient  string
	resetName       string
	resetURL        string
	resetEmailCount int
}

func (m *mockEmailService) SendPasswordResetEmail(recipientEmail, userName, resetURL string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resetRecipient = recipientEmail
	m.resetName = userName
	m.resetURL = resetURL
	m.resetEmailCount++
	return nil
}

func TestAuthHandler_ForgotPassword_AntiEnumeration(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	mockEmail := &mockEmailService{}
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, mockEmail, time.Hour, false, "", "http://localhost:5173")

	// 1. Unknown email should still return 200 OK with generic message
	body, _ := json.Marshal(map[string]string{
		"email": "nonexistent@example.com",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/forgot-password", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.ForgotPassword(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 for non-existent email, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["message"] == "" {
		t.Fatalf("expected generic message in response")
	}

	mockEmail.mu.Lock()
	if mockEmail.resetEmailCount != 0 {
		t.Errorf("expected no email to be sent for non-existent user, sent %d", mockEmail.resetEmailCount)
	}
	mockEmail.mu.Unlock()

	// 2. Invalid email format should return 400 Bad Request
	bodyInvalid, _ := json.Marshal(map[string]string{
		"email": "not-an-email",
	})
	reqInvalid := httptest.NewRequest(http.MethodPost, "/api/v1/auth/forgot-password", bytes.NewReader(bodyInvalid))
	wInvalid := httptest.NewRecorder()

	h.ForgotPassword(wInvalid, reqInvalid)

	if wInvalid.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid email, got %d", wInvalid.Code)
	}
}

func TestAuthHandler_ForgotPassword_SuccessAndResetFlow(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	mockEmail := &mockEmailService{}
	h := handler.NewAuthHandler(userRepo, orgRepo, authSvc, mockEmail, time.Hour, false, "", "http://localhost:5173")

	// Create test user
	oldPassword := "initialPassword123"
	hash, _ := bcrypt.GenerateFromPassword([]byte(oldPassword), bcrypt.DefaultCost)
	user, err := userRepo.Create(context.Background(), "user@test.com", string(hash), "Jane Doe", model.RoleOrgAdmin, nil)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// 1. Request password reset
	body, _ := json.Marshal(map[string]string{
		"email": "user@test.com",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/forgot-password", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.ForgotPassword(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Wait briefly for asynchronous goroutine sending email
	time.Sleep(50 * time.Millisecond)

	mockEmail.mu.Lock()
	if mockEmail.resetEmailCount != 1 {
		t.Fatalf("expected 1 reset email sent, got %d", mockEmail.resetEmailCount)
	}
	if mockEmail.resetRecipient != "user@test.com" {
		t.Errorf("expected recipient user@test.com, got %s", mockEmail.resetRecipient)
	}
	if mockEmail.resetURL == "" {
		t.Errorf("expected reset URL to be populated")
	}
	mockEmail.mu.Unlock()

	// Verify token was stored on user in repo
	userAfterForgot, err := userRepo.GetByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("failed to fetch user after forgot password: %v", err)
	}
	if userAfterForgot.PasswordResetToken == nil || *userAfterForgot.PasswordResetToken == "" {
		t.Fatalf("expected password reset token to be set on user")
	}
	token := *userAfterForgot.PasswordResetToken

	// 2. Verify reset token (valid)
	verifyReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/reset-password/verify?token="+token, nil)
	verifyW := httptest.NewRecorder()

	h.VerifyResetToken(verifyW, verifyReq)

	if verifyW.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid token verify, got %d: %s", verifyW.Code, verifyW.Body.String())
	}

	var verifyResp map[string]any
	_ = json.Unmarshal(verifyW.Body.Bytes(), &verifyResp)
	if valid, ok := verifyResp["valid"].(bool); !ok || !valid {
		t.Errorf("expected valid: true, got %v", verifyResp["valid"])
	}
	if maskedEmail, ok := verifyResp["email"].(string); !ok || maskedEmail == "" {
		t.Errorf("expected masked email to be returned, got %v", verifyResp["email"])
	}

	// 3. Verify reset token (invalid token)
	invalidVerifyReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/reset-password/verify?token=invalid-token", nil)
	invalidVerifyW := httptest.NewRecorder()

	h.VerifyResetToken(invalidVerifyW, invalidVerifyReq)

	if invalidVerifyW.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid token verify, got %d", invalidVerifyW.Code)
	}

	// 4. Reset password - validation error: password too short
	shortPassBody, _ := json.Marshal(map[string]string{
		"token":    token,
		"password": "short",
	})
	shortPassReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(shortPassBody))
	shortPassReq.Header.Set("Content-Type", "application/json")
	shortPassW := httptest.NewRecorder()

	h.ResetPassword(shortPassW, shortPassReq)

	if shortPassW.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for short password, got %d: %s", shortPassW.Code, shortPassW.Body.String())
	}

	// 5. Reset password - success
	newPassword := "NewBrandNewPassword123!"
	resetBody, _ := json.Marshal(map[string]string{
		"token":    token,
		"password": newPassword,
	})
	resetReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(resetBody))
	resetReq.Header.Set("Content-Type", "application/json")
	resetW := httptest.NewRecorder()

	h.ResetPassword(resetW, resetReq)

	if resetW.Code != http.StatusOK {
		t.Fatalf("expected 200 for reset password, got %d: %s", resetW.Code, resetW.Body.String())
	}

	// 6. Token should now be consumed / cleared
	tokenReusedReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(resetBody))
	tokenReusedReq.Header.Set("Content-Type", "application/json")
	tokenReusedW := httptest.NewRecorder()

	h.ResetPassword(tokenReusedW, tokenReusedReq)

	if tokenReusedW.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for reused token, got %d: %s", tokenReusedW.Code, tokenReusedW.Body.String())
	}

	// 7. Verify user can now log in with the new password
	loginBody, _ := json.Marshal(map[string]string{
		"email":    "user@test.com",
		"password": newPassword,
	})
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()

	h.Login(loginW, loginReq)

	if loginW.Code != http.StatusOK {
		t.Fatalf("expected 200 for login with new password, got %d: %s", loginW.Code, loginW.Body.String())
	}

	// 8. Verify old password no longer works
	oldLoginBody, _ := json.Marshal(map[string]string{
		"email":    "user@test.com",
		"password": oldPassword,
	})
	oldLoginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(oldLoginBody))
	oldLoginReq.Header.Set("Content-Type", "application/json")
	oldLoginW := httptest.NewRecorder()

	h.Login(oldLoginW, oldLoginReq)

	if oldLoginW.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for login with old password, got %d", oldLoginW.Code)
	}
}
