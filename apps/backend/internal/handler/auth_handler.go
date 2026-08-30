package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AuthHandler struct {
	userRepo   *repository.UserRepository
	orgRepo    *repository.OrgRepository
	authSvc    *auth.Service
	cookieOpts auth.CookieOptions
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	orgRepo *repository.OrgRepository,
	authSvc *auth.Service,
	ttl time.Duration,
	secure bool,
	domain string,
) *AuthHandler {
	return &AuthHandler{
		userRepo: userRepo,
		orgRepo:  orgRepo,
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

type RegisterCompanyRequest struct {
	CompanyName   string `json:"company_name"`
	CompanySlug   string `json:"company_slug"`
	ContactEmail  string `json:"contact_email"`
	LogoURL       string `json:"logo_url,omitempty"`
	AdminName     string `json:"admin_name"`
	AdminEmail    string `json:"admin_email"`
	AdminPassword string `json:"admin_password"`
}

type OrganizationInfo struct {
	ID      string `json:"id"`
	Slug    string `json:"slug"`
	Name    string `json:"name"`
	LogoURL string `json:"logo_url,omitempty"`
	Status  string `json:"status"`
}

type UserResponse struct {
	ID             string            `json:"id"`
	OrganizationID *string           `json:"organization_id,omitempty"`
	Organization   *OrganizationInfo `json:"organization,omitempty"`
	Email          string            `json:"email"`
	Name           string            `json:"name"`
	Role           string            `json:"role"`
}

type AuthResponse struct {
	User      UserResponse `json:"user"`
	CSRFToken string       `json:"csrf_token"`
}

func (h *AuthHandler) RegisterCompany(w http.ResponseWriter, r *http.Request) {
	var req RegisterCompanyRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.CompanyName = strings.TrimSpace(req.CompanyName)
	req.CompanySlug = strings.ToLower(strings.TrimSpace(req.CompanySlug))
	req.AdminEmail = strings.ToLower(strings.TrimSpace(req.AdminEmail))
	req.AdminName = strings.TrimSpace(req.AdminName)

	if req.CompanyName == "" || req.CompanySlug == "" || req.AdminEmail == "" || req.AdminPassword == "" {
		httpx.Error(w, http.StatusBadRequest, "company name, slug, admin email, and password are required")
		return
	}

	if len(req.AdminPassword) < 6 {
		httpx.Error(w, http.StatusBadRequest, "admin password must be at least 6 characters")
		return
	}

	// 1. Create Organization in pending_approval status
	org, err := h.orgRepo.Register(r.Context(), req.CompanySlug, req.CompanyName, req.ContactEmail, req.LogoURL, model.OrgStatusPendingApproval)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to register company")
		return
	}

	// 2. Hash admin password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to secure password")
		return
	}

	// 3. Create Admin User
	user, err := h.userRepo.Create(r.Context(), req.AdminEmail, string(hash), req.AdminName, "org_admin", &org.ID)
	if err != nil {
		if errors.Is(err, repository.ErrUserAlreadyExists) {
			httpx.Error(w, http.StatusConflict, "an account with this email already exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to create admin user")
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"message": "Company registered successfully. Your application is now pending platform review.",
		"status":  "pending_approval",
		"company": OrganizationInfo{
			ID:      org.ID.String(),
			Slug:    org.Slug,
			Name:    org.Name,
			LogoURL: org.LogoURL,
			Status:  string(org.Status),
		},
		"admin_email": user.Email,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), strings.ToLower(strings.TrimSpace(req.Email)))
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

	// Check Company approval status if user is associated with an organization
	var orgInfo *OrganizationInfo
	if user.OrganizationID != nil {
		org, err := h.orgRepo.GetByID(r.Context(), *user.OrganizationID)
		if err == nil && org != nil {
			orgInfo = &OrganizationInfo{
				ID:      org.ID.String(),
				Slug:    org.Slug,
				Name:    org.Name,
				LogoURL: org.LogoURL,
				Status:  string(org.Status),
			}

			// Reject login if company is still pending approval or rejected
			if org.Status == model.OrgStatusPendingApproval {
				httpx.Error(w, http.StatusForbidden, "Your company registration is pending approval by FellowHire platform admins. You will receive access once approved.")
				return
			}
			if org.Status == model.OrgStatusRejected {
				httpx.Error(w, http.StatusForbidden, "Your company registration request was declined. Please contact support.")
				return
			}
		}
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
			Organization:   orgInfo,
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
	var orgInfo *OrganizationInfo
	if user.OrganizationID != nil {
		s := user.OrganizationID.String()
		orgIDStr = &s

		org, err := h.orgRepo.GetByID(r.Context(), *user.OrganizationID)
		if err == nil && org != nil {
			orgInfo = &OrganizationInfo{
				ID:      org.ID.String(),
				Slug:    org.Slug,
				Name:    org.Name,
				LogoURL: org.LogoURL,
				Status:  string(org.Status),
			}
		}
	}

	httpx.JSON(w, http.StatusOK, UserResponse{
		ID:             user.ID.String(),
		OrganizationID: orgIDStr,
		Organization:   orgInfo,
		Email:          user.Email,
		Name:           user.Name,
		Role:           user.Role,
	})
}
