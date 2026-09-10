package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AuthHandler struct {
	userRepo   *repository.UserRepository
	orgRepo    *repository.OrgRepository
	authSvc    *auth.Service
	emailSvc   email.Service
	cookieOpts auth.CookieOptions
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	orgRepo *repository.OrgRepository,
	authSvc *auth.Service,
	emailSvc email.Service,
	ttl time.Duration,
	secure bool,
	domain string,
) *AuthHandler {
	return &AuthHandler{
		userRepo: userRepo,
		orgRepo:  orgRepo,
		authSvc:  authSvc,
		emailSvc: emailSvc,
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
	ID           string `json:"id"`
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	LogoURL      string `json:"logo_url,omitempty"`
	ContactEmail string `json:"contact_email,omitempty"`
	Status       string `json:"status"`
}

type UserResponse struct {
	ID             string            `json:"id"`
	OrganizationID *string           `json:"organization_id,omitempty"`
	Organization   *OrganizationInfo `json:"organization,omitempty"`
	Email          string            `json:"email"`
	Name           string            `json:"name"`
	AvatarURL      string            `json:"avatar_url"`
	Role           string            `json:"role"`
}

type UpdateProfileRequest struct {
	Name                string  `json:"name"`
	AvatarURL           string  `json:"avatar_url"`
	Password            *string `json:"password,omitempty"`
	CompanyName         *string `json:"company_name,omitempty"`
	CompanyLogoURL      *string `json:"company_logo_url,omitempty"`
	CompanyContactEmail *string `json:"company_contact_email,omitempty"`
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

	if req.CompanyName == "" || req.CompanySlug == "" || req.AdminEmail == "" {
		httpx.Error(w, http.StatusBadRequest, "company name, slug, and admin email are required")
		return
	}

	if req.AdminPassword != "" && len(req.AdminPassword) < 6 {
		httpx.Error(w, http.StatusBadRequest, "admin password must be at least 6 characters")
		return
	}

	// 1. Create Organization in approved status so admin can immediately access workspace
	org, err := h.orgRepo.Register(r.Context(), req.CompanySlug, req.CompanyName, req.ContactEmail, req.LogoURL, model.OrgStatusApproved)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to register company")
		return
	}

	// 2. Resolve or Create Admin User
	var user *model.User
	existingUser, err := h.userRepo.GetByEmail(r.Context(), req.AdminEmail)
	if err == nil && existingUser != nil {
		// Update user org and role
		if err := h.userRepo.UpdateOrgAndRole(r.Context(), existingUser.ID, &org.ID, "org_admin", req.AdminName); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to link admin account")
			return
		}
		user = existingUser
		if req.AdminName != "" {
			user.Name = req.AdminName
		}
		user.OrganizationID = &org.ID
		user.Role = "org_admin"
	} else {
		hashStr := ""
		if req.AdminPassword != "" {
			hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to secure password")
				return
			}
			hashStr = string(hash)
		}
		user, err = h.userRepo.Create(r.Context(), req.AdminEmail, hashStr, req.AdminName, "org_admin", &org.ID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to create admin user")
			return
		}
	}

	if h.emailSvc != nil {
		_ = h.emailSvc.SendRegistrationEmail(user.Email, user.Name, org.Name, "")
	}

	token, err := h.authSvc.GenerateToken(user.ID, user.OrganizationID, user.Email, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue session token")
		return
	}

	csrfToken, err := auth.GenerateCSRFToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue csrf token")
		return
	}

	auth.SetAuthCookies(w, token, csrfToken, h.cookieOpts)

	// Record last registered admin email for seamless local dev OAuth & logins
	sameSite := http.SameSiteLaxMode
	if h.cookieOpts.Secure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "last_admin_email",
		Value:    user.Email,
		Path:     "/",
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
		HttpOnly: false,
		Secure:   h.cookieOpts.Secure,
		Domain:   h.cookieOpts.Domain,
		SameSite: sameSite,
	})

	var orgIDStr *string
	if user.OrganizationID != nil {
		s := user.OrganizationID.String()
		orgIDStr = &s
	}

	orgInfo := &OrganizationInfo{
		ID:           org.ID.String(),
		Slug:         org.Slug,
		Name:         org.Name,
		LogoURL:      org.LogoURL,
		ContactEmail: org.ContactEmail,
		Status:       string(org.Status),
	}

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"message": "Company registered successfully.",
		"status":  string(org.Status),
		"company": orgInfo,
		"user": UserResponse{
			ID:             user.ID.String(),
			OrganizationID: orgIDStr,
			Organization:   orgInfo,
			Email:          user.Email,
			Name:           user.Name,
			AvatarURL:      user.AvatarURL,
			Role:           user.Role,
		},
		"csrf_token":  csrfToken,
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
				ID:           org.ID.String(),
				Slug:         org.Slug,
				Name:         org.Name,
				LogoURL:      org.LogoURL,
				ContactEmail: org.ContactEmail,
				Status:       string(org.Status),
			}

			// Reject login only if company registration was declined
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
			AvatarURL:      user.AvatarURL,
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
				ID:           org.ID.String(),
				Slug:         org.Slug,
				Name:         org.Name,
				LogoURL:      org.LogoURL,
				ContactEmail: org.ContactEmail,
				Status:       string(org.Status),
			}
		}
	}

	httpx.JSON(w, http.StatusOK, UserResponse{
		ID:             user.ID.String(),
		OrganizationID: orgIDStr,
		Organization:   orgInfo,
		Email:          user.Email,
		Name:           user.Name,
		AvatarURL:      user.AvatarURL,
		Role:           user.Role,
	})
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req UpdateProfileRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	var passwordHash *string
	if req.Password != nil && strings.TrimSpace(*req.Password) != "" {
		pwd := strings.TrimSpace(*req.Password)
		if len(pwd) < 6 {
			httpx.Error(w, http.StatusBadRequest, "password must be at least 6 characters")
			return
		}
		hash, err := auth.HashPassword(pwd)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to hash password")
			return
		}
		passwordHash = &hash
	}

	user, err := h.userRepo.UpdateProfile(r.Context(), claims.UserID, req.Name, req.AvatarURL, passwordHash)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	// If user is associated with an organization and company fields are provided, update company
	var orgInfo *OrganizationInfo
	if user.OrganizationID != nil {
		currentOrg, err := h.orgRepo.GetByID(r.Context(), *user.OrganizationID)
		if err == nil && currentOrg != nil {
			newOrgName := currentOrg.Name
			if req.CompanyName != nil && strings.TrimSpace(*req.CompanyName) != "" {
				newOrgName = strings.TrimSpace(*req.CompanyName)
			}
			newContactEmail := currentOrg.ContactEmail
			if req.CompanyContactEmail != nil && strings.TrimSpace(*req.CompanyContactEmail) != "" {
				newContactEmail = strings.TrimSpace(*req.CompanyContactEmail)
			}
			newLogoURL := currentOrg.LogoURL
			if req.CompanyLogoURL != nil {
				newLogoURL = strings.TrimSpace(*req.CompanyLogoURL)
			}

			updatedOrg, err := h.orgRepo.Update(r.Context(), currentOrg.ID, newOrgName, newContactEmail, newLogoURL)
			if err == nil && updatedOrg != nil {
				orgInfo = &OrganizationInfo{
					ID:           updatedOrg.ID.String(),
					Slug:         updatedOrg.Slug,
					Name:         updatedOrg.Name,
					LogoURL:      updatedOrg.LogoURL,
					ContactEmail: updatedOrg.ContactEmail,
					Status:       string(updatedOrg.Status),
				}
			}
		}
	}

	var orgIDStr *string
	if user.OrganizationID != nil {
		s := user.OrganizationID.String()
		orgIDStr = &s
	}

	httpx.JSON(w, http.StatusOK, UserResponse{
		ID:             user.ID.String(),
		OrganizationID: orgIDStr,
		Organization:   orgInfo,
		Email:          user.Email,
		Name:           user.Name,
		AvatarURL:      user.AvatarURL,
		Role:           user.Role,
	})
}
