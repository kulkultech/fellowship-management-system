package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/repository"
)

type AuthHandler struct {
	userRepo   *repository.UserRepository
	authSvc    *auth.Service
	cookieOpts auth.CookieOptions
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	authSvc *auth.Service,
	ttl time.Duration,
	secure bool,
	domain string,
) *AuthHandler {
	return &AuthHandler{
		userRepo: userRepo,
		authSvc:  authSvc,
		cookieOpts: auth.CookieOptions{
			Secure: secure,
			Domain: domain,
			MaxAge: ttl,
		},
	}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UserResponse struct {
	ID             string  `json:"id"`
	OrganizationID *string `json:"organization_id,omitempty"`
	Email          string  `json:"email"`
	Name           string  `json:"name"`
	Role           string  `json:"role"`
}

type AuthResponse struct {
	User      UserResponse `json:"user"`
	CSRFToken string       `json:"csrf_token"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := h.authSvc.GenerateToken(user.ID, user.OrganizationID, user.Email, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue token")
		return
	}

	csrfToken, err := auth.GenerateCSRFToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue csrf token")
		return
	}

	auth.SetAuthCookies(w, token, csrfToken, h.cookieOpts)

	var orgIDStr *string
	if user.OrganizationID != nil {
		s := user.OrganizationID.String()
		orgIDStr = &s
	}

	httpx.JSON(w, http.StatusOK, AuthResponse{
		User: UserResponse{
			ID:             user.ID.String(),
			OrganizationID: orgIDStr,
			Email:          user.Email,
			Name:           user.Name,
			Role:           user.Role,
		},
		CSRFToken: csrfToken,
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, _ *http.Request) {
	auth.ClearAuthCookies(w, h.cookieOpts)
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), claims.UserID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "user not found")
		return
	}

	var orgIDStr *string
	if user.OrganizationID != nil {
		s := user.OrganizationID.String()
		orgIDStr = &s
	}

	httpx.JSON(w, http.StatusOK, UserResponse{
		ID:             user.ID.String(),
		OrganizationID: orgIDStr,
		Email:          user.Email,
		Name:           user.Name,
		Role:           user.Role,
	})
}
