package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

// Each test here replays an account-takeover attempt and checks it is refused.

func oauthCallback(t *testing.T, devLogin bool, query string, stateCookie string) *httptest.ResponseRecorder {
	t.Helper()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewOAuthHandler(nil, userRepo, orgRepo, authSvc, time.Hour, false, "", "http://localhost:5173", slog.New(slog.NewTextHandler(io.Discard, nil)), devLogin)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oauth/google/callback?"+query, nil)
	if stateCookie != "" {
		req.AddCookie(&http.Cookie{Name: auth.OAuthStateCookie, Value: stateCookie})
	}
	w := httptest.NewRecorder()
	h.Callback(w, req)
	return w
}

func hasSessionCookie(w *httptest.ResponseRecorder) bool {
	for _, c := range w.Result().Cookies() {
		if c.Name == auth.AuthCookieName && c.Value != "" {
			return true
		}
	}
	return false
}

func TestOAuthCallback_DevLoginRefusedInProduction(t *testing.T) {
	q := "state=aaaaaaaaaaaaaaaa&code=mock_dev_code&email=boss@kulkul.tech"
	// The attack: no state cookie, a made-up state and the dev code
	if w := oauthCallback(t, false, q, ""); w.Code != http.StatusBadRequest || hasSessionCookie(w) {
		t.Fatalf("expected 400 and no session without a state cookie, got %d", w.Code)
	}
	// Even with a matching state cookie, the dev code must not sign anyone in outside development
	if w := oauthCallback(t, false, q, "aaaaaaaaaaaaaaaa"); w.Code != http.StatusBadRequest || hasSessionCookie(w) {
		t.Fatalf("expected the dev code to be refused in production, got %d", w.Code)
	}
}

func TestOAuthCallback_StateCookieRequired(t *testing.T) {
	q := "state=aaaaaaaaaaaaaaaa&code=mock_dev_code"
	if w := oauthCallback(t, true, q, ""); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without a state cookie, got %d", w.Code)
	}
	if w := oauthCallback(t, true, q, "bbbbbbbbbbbbbbbb"); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a state that does not match the cookie, got %d", w.Code)
	}
	// Local development still works
	if w := oauthCallback(t, true, q, "aaaaaaaaaaaaaaaa"); !hasSessionCookie(w) {
		t.Fatalf("expected local dev sign-in to work, got %d: %s", w.Code, w.Body.String())
	}
}

func postJSON(t *testing.T, fn http.HandlerFunc, path string, payload any, mutate func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if mutate != nil {
		mutate(req)
	}
	w := httptest.NewRecorder()
	fn(w, req)
	return w
}

func TestRegisterCandidate_CannotSetPasswordOnGoogleAccount(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, repository.NewOrgRepository(nil), authSvc, nil, time.Hour, false, "", "http://localhost:5173")
	victim, _ := userRepo.Create(context.Background(), "admin@victim.org", "", "Victim", model.RoleOrgAdmin, nil)

	w := postJSON(t, h.RegisterCandidate, "/api/v1/auth/register-candidate", map[string]string{
		"name": "Attacker", "email": "admin@victim.org", "password": "attacker-pass",
	}, nil)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
	}
	after, _ := userRepo.GetByID(context.Background(), victim.ID)
	if after.PasswordHash != "" {
		t.Fatalf("the victim's account must not get a password")
	}
}

func TestRegisterCompany_CannotClaimSomeoneElsesAccount(t *testing.T) {
	userRepo := repository.NewUserRepository(nil)
	authSvc := auth.NewService("test-secret-key-32characters-long!!", time.Hour)
	h := handler.NewAuthHandler(userRepo, repository.NewOrgRepository(nil), authSvc, nil, time.Hour, false, "", "http://localhost:5173")
	hash, _ := auth.HashPassword("victim-pass")
	victim, _ := userRepo.Create(context.Background(), "mentor@victim.org", hash, "Victim", model.RoleMentor, nil)
	googleOnly, _ := userRepo.Create(context.Background(), "google@victim.org", "", "Google Victim", model.RoleCandidate, nil)

	for _, tc := range []struct {
		email, password string
	}{
		{"mentor@victim.org", "wrong-pass"},
		{"mentor@victim.org", ""},
		{"google@victim.org", "attacker-pass"},
	} {
		w := postJSON(t, h.RegisterCompany, "/api/v1/auth/register-company", map[string]string{
			"company_name": "Evil Co", "company_slug": "evil-" + tc.email[:4], "admin_name": "Attacker",
			"admin_email": tc.email, "admin_password": tc.password,
		}, nil)
		if w.Code != http.StatusConflict {
			t.Fatalf("%s: expected 409, got %d: %s", tc.email, w.Code, w.Body.String())
		}
	}
	if u, _ := userRepo.GetByID(context.Background(), victim.ID); u.Role != model.RoleMentor || u.OrganizationID != nil {
		t.Fatalf("the victim must stay where they were, got role %s", u.Role)
	}
	if u, _ := userRepo.GetByID(context.Background(), googleOnly.ID); u.PasswordHash != "" {
		t.Fatalf("the Google-only victim must not get a password")
	}
}

func TestAcceptInvitation_ExistingAccountNeedsItsOwner(t *testing.T) {
	_, authHandler, userRepo, _, invRepo, authSvc, orgID := setupTestInvitationEnv(t)
	hash, _ := auth.HashPassword("victim-pass")
	victim, _ := userRepo.Create(context.Background(), "boss@kulkul.tech", hash, "Boss", model.RoleCandidate, nil)
	inv, _ := invRepo.Create(context.Background(), &model.Invitation{
		Email: "boss@kulkul.tech", Role: model.RoleOrgAdmin, OrganizationID: &orgID,
		Token: "invite-token-1234567890", Status: model.InvitationStatusPending, ExpiresAt: time.Now().Add(time.Hour),
	})
	accept := func(payload map[string]string, mutate func(*http.Request)) *httptest.ResponseRecorder {
		return postJSON(t, authHandler.AcceptInvitation, "/api/v1/auth/invitations/"+inv.Token+"/accept", payload, func(r *http.Request) {
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("token", inv.Token)
			*r = *r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
			if mutate != nil {
				mutate(r)
			}
		})
	}

	// The attack: whoever holds the link sets a new password and gets a session as the victim
	if w := accept(map[string]string{"password": "attacker-pass"}, nil); w.Code != http.StatusUnauthorized || hasSessionCookie(w) {
		t.Fatalf("expected 401 and no session, got %d: %s", w.Code, w.Body.String())
	}
	if w := accept(map[string]string{}, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a password, got %d", w.Code)
	}
	if u, _ := userRepo.GetByID(context.Background(), victim.ID); u.Role != model.RoleCandidate || auth.CheckPassword(u.PasswordHash, "attacker-pass") {
		t.Fatalf("the victim's role and password must be unchanged")
	}

	// The real owner can accept with their current password
	if w := accept(map[string]string{"password": "victim-pass"}, nil); w.Code != http.StatusOK || !hasSessionCookie(w) {
		t.Fatalf("expected the owner to accept with their password, got %d: %s", w.Code, w.Body.String())
	}

	// ...or by being signed in already (Google accounts)
	googleUser, _ := userRepo.Create(context.Background(), "google@kulkul.tech", "", "G", model.RoleCandidate, nil)
	inv2, _ := invRepo.Create(context.Background(), &model.Invitation{
		Email: "google@kulkul.tech", Role: model.RoleOrgAdmin, OrganizationID: &orgID,
		Token: "invite-token-0987654321", Status: model.InvitationStatusPending, ExpiresAt: time.Now().Add(time.Hour),
	})
	inv.Token = inv2.Token
	if w := accept(map[string]string{}, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("expected a Google-only account to need sign-in, got %d", w.Code)
	}
	token, _ := authSvc.GenerateToken(googleUser.ID, nil, googleUser.Email, googleUser.Role)
	if w := accept(map[string]string{}, func(r *http.Request) { r.AddCookie(&http.Cookie{Name: auth.AuthCookieName, Value: token}) }); w.Code != http.StatusOK {
		t.Fatalf("expected the signed-in owner to accept, got %d: %s", w.Code, w.Body.String())
	}
}
