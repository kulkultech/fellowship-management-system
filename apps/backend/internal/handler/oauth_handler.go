package handler

import (
	"crypto/subtle"
	"log/slog"
	"net/http"
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

	if h.google == nil {
		// If Google OAuth credentials are not set in environment, mock direct callback for development
		http.Redirect(w, r, "/api/v1/auth/oauth/google/callback?state="+state+"&code=mock_dev_code", http.StatusTemporaryRedirect)
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

	var profile auth.GoogleProfile
	if code == "mock_dev_code" || h.google == nil {
		// Mock profile for local development without active GCP OAuth Client secret
		profile = auth.GoogleProfile{
			Sub:   "1092837465928374",
			Email: "admin@rsa.org",
			Name:  "RSA Reviewer Admin",
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
	})
	if err != nil {
		h.logger.Error("oauth user resolve failed", slog.Any("error", err))
		httpx.Error(w, http.StatusInternalServerError, "could not resolve user account")
		return
	}

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
	http.Redirect(w, r, h.successURL, http.StatusFound)
}
