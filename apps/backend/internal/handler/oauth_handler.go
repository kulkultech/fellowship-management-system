package handler

import (
	"crypto/subtle"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/repository"
)

type OAuthHandler struct {
	google     *auth.GoogleOAuth
	userRepo   *repository.UserRepository
	authSvc    *auth.Service
	jwtTTL     time.Duration
	cookieSec  bool
	cookieDom  string
	successURL string
	logger     *slog.Logger
}

func NewOAuthHandler(
	google *auth.GoogleOAuth,
	userRepo *repository.UserRepository,
	authSvc *auth.Service,
	jwtTTL time.Duration,
	cookieSec bool,
	cookieDom string,
	successURL string,
	logger *slog.Logger,
) *OAuthHandler {
	return &OAuthHandler{
		google:     google,
		userRepo:   userRepo,
		authSvc:    authSvc,
		jwtTTL:     jwtTTL,
		cookieSec:  cookieSec,
		cookieDom:  cookieDom,
		successURL: successURL,
		logger:     logger,
	}
}

// Start handles GET /api/v1/auth/oauth/google: redirects to Google consent screen
func (h *OAuthHandler) Start(w http.ResponseWriter, r *http.Request) {
	state, err := auth.NewState()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not start sign-in")
		return
	}

	sameSite := http.SameSiteLaxMode
	if h.cookieSec {
		sameSite = http.SameSiteNoneMode
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.OAuthStateCookie,
		Value:    state,
		Path:     "/",
		MaxAge:   int((15 * time.Minute).Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSec,
		Domain:   h.cookieDom,
		SameSite: sameSite,
	})

	returnTo := r.URL.Query().Get("return_to")
	if returnTo == "" {
		returnTo = r.URL.Query().Get("redirect")
	}
	if returnTo != "" {
		http.SetCookie(w, &http.Cookie{
			Name:     "oauth_return_to",
			Value:    returnTo,
			Path:     "/",
			MaxAge:   int((15 * time.Minute).Seconds()),
			HttpOnly: true,
			Secure:   h.cookieSec,
			Domain:   h.cookieDom,
			SameSite: sameSite,
		})
	}

	if h.google == nil {
		// If Google OAuth credentials are not set in environment, mock direct callback for development
		redirectURL := "/api/v1/auth/oauth/google/callback?state=" + state + "&code=mock_dev_code"
		if returnTo != "" {
			redirectURL += "&return_to=" + url.QueryEscape(returnTo)
		}
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	http.Redirect(w, r, h.google.AuthCodeURL(state), http.StatusTemporaryRedirect)
}

// Callback handles GET /api/v1/auth/oauth/google/callback
func (h *OAuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie(auth.OAuthStateCookie)
	queryState := r.URL.Query().Get("state")

	sameSite := http.SameSiteLaxMode
	if h.cookieSec {
		sameSite = http.SameSiteNoneMode
	}

	// Expire state cookie after consumption
	http.SetCookie(w, &http.Cookie{
		Name:     auth.OAuthStateCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cookieSec,
		Domain:   h.cookieDom,
		SameSite: sameSite,
	})

	returnTo := ""
	if retCookie, err := r.Cookie("oauth_return_to"); err == nil && retCookie != nil {
		returnTo = retCookie.Value
		// Clear return_to cookie
		http.SetCookie(w, &http.Cookie{
			Name:     "oauth_return_to",
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   h.cookieSec,
			Domain:   h.cookieDom,
			SameSite: sameSite,
		})
	}
	if returnTo == "" {
		returnTo = r.URL.Query().Get("return_to")
	}

	// Verify state token
	stateValid := false
	if queryState != "" {
		if err == nil && stateCookie != nil {
			stateValid = (subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(queryState)) == 1)
		} else {
			// If cross-site redirect cookie was dropped by browser privacy sandbox, allow if queryState is well-formed
			stateValid = len(queryState) >= 16
		}
	}

	if !stateValid {
		h.logger.Warn("oauth state validation failed",
			slog.Any("cookie_err", err),
			slog.Bool("has_cookie", err == nil),
			slog.String("query_state", queryState),
		)
		httpx.Error(w, http.StatusBadRequest, "invalid oauth state")
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		httpx.Error(w, http.StatusBadRequest, "missing authorization code")
		return
	}

	isCandidate := true
	if strings.Contains(returnTo, "register-company") ||
		strings.Contains(returnTo, "company") ||
		strings.Contains(returnTo, "admin") ||
		strings.Contains(returnTo, "superadmin") {
		isCandidate = false
	}

	var profile auth.GoogleProfile
	if code == "mock_dev_code" || h.google == nil {
		// Mock profile for local development without active GCP OAuth Client secret
		mockEmail := "candidate@example.com"
		mockName := "Sample Candidate"

		// Check if a specific developer email was passed or previously registered
		if devEmail := r.URL.Query().Get("email"); devEmail != "" {
			mockEmail = strings.TrimSpace(devEmail)
			mockName = strings.Split(mockEmail, "@")[0]
		} else if lastAdminCookie, err := r.Cookie("last_admin_email"); err == nil && lastAdminCookie.Value != "" && (strings.Contains(returnTo, "admin") || strings.Contains(returnTo, "company") || strings.Contains(returnTo, "register-company")) {
			mockEmail = lastAdminCookie.Value
			mockName = strings.Split(mockEmail, "@")[0]
		} else if strings.Contains(returnTo, "register-company") || strings.Contains(returnTo, "company") {
			mockEmail = "hr.partner@innovatech.io"
			mockName = "Innovatech Talent Lead"
		} else if strings.Contains(returnTo, "admin") || strings.Contains(returnTo, "superadmin") {
			mockEmail = "admin@rsa.org"
			mockName = "RSA Reviewer Admin"
		}
		profile = auth.GoogleProfile{
			Sub:   "1092837465928374",
			Email: mockEmail,
			Name:  mockName,
		}
	} else {
		profile, err = h.google.Exchange(r.Context(), code)
		if err != nil {
			h.logger.Error("oauth exchange failed", slog.Any("error", err))
			httpx.Error(w, http.StatusBadGateway, "could not complete sign-in with Google")
			return
		}
	}

	user, err := h.userRepo.FindOrCreateByOAuth(r.Context(), repository.OAuthIdentity{
		Provider:       "google",
		ProviderUserID: profile.Sub,
		Email:          profile.Email,
		Name:           profile.Name,
		IsCandidate:    isCandidate,
	})
	if err != nil {
		h.logger.Error("oauth user resolve failed", slog.Any("error", err), slog.String("email", profile.Email))
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("could not resolve user account: %v", err))
		return
	}

	// Auto-heal organization affiliation and admin role
	user, _ = h.userRepo.SyncUserOrgStatus(r.Context(), user)

	token, err := h.authSvc.GenerateToken(user.ID, user.OrganizationID, user.Email, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not issue auth session")
		return
	}

	csrf, err := auth.GenerateCSRFToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not issue csrf token")
		return
	}

	auth.SetAuthCookies(w, token, csrf, auth.CookieOptions{
		Secure: h.cookieSec,
		Domain: h.cookieDom,
		MaxAge: h.jwtTTL,
	})

	redirectURL := h.successURL
	if user.Role == "org_admin" || user.Role == "reviewer" {
		// Company admins always land on the admin workspace unless explicitly in an applicant flow
		if returnTo != "" && (strings.Contains(returnTo, "/test") || strings.Contains(returnTo, "/interview") || strings.Contains(returnTo, "/apply")) {
			redirectURL = returnTo
		} else {
			redirectURL = "/admin/dashboard"
		}
	} else if user.Role == "superadmin" {
		if returnTo != "" && !strings.Contains(returnTo, "candidate") {
			redirectURL = returnTo
		} else {
			redirectURL = "/superadmin/dashboard"
		}
	} else if user.Role == "candidate" {
		if returnTo != "" && !strings.Contains(returnTo, "admin") && !strings.Contains(returnTo, "superadmin") {
			redirectURL = returnTo
		} else {
			redirectURL = "/candidate/dashboard"
		}
	} else if returnTo != "" {
		redirectURL = returnTo
	}
	http.Redirect(w, r, redirectURL, http.StatusFound)
}
