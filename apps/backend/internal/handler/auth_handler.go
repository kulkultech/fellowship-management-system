package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/go-chi/chi/v5"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AuthHandler struct {
	userRepo       *repository.UserRepository
	orgRepo        *repository.OrgRepository
	invitationRepo *repository.InvitationRepository
	mentorRepo     *repository.MentorRepository
	authSvc        *auth.Service
	emailSvc       email.Service
	cookieOpts     auth.CookieOptions
	frontendURL    string
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	orgRepo *repository.OrgRepository,
	authSvc *auth.Service,
	emailSvc email.Service,
	ttl time.Duration,
	secure bool,
	domain string,
	frontendURL string,
) *AuthHandler {
	if frontendURL == "" {
		frontendURL = strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
		if frontendURL == "" {
			frontendURL = "http://localhost:5173"
		}
	}
	return &AuthHandler{
		userRepo:       userRepo,
		orgRepo:        orgRepo,
		invitationRepo: repository.NewInvitationRepository(nil),
		authSvc:        authSvc,
		emailSvc:       emailSvc,
		frontendURL:    frontendURL,
		cookieOpts: auth.CookieOptions{
			Secure: secure,
			Domain: domain,
			MaxAge: ttl,
		},
	}
}

func (h *AuthHandler) SetInvitationRepo(repo *repository.InvitationRepository) {
	if repo != nil {
		h.invitationRepo = repo
	}
}

func (h *AuthHandler) SetMentorRepo(repo *repository.MentorRepository) {
	if repo != nil {
		h.mentorRepo = repo
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
	EmailVerified  bool              `json:"email_verified"`
}

type RegisterCandidateRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type ActivateAccountRequest struct {
	Token string `json:"token"`
}

type ResendActivationRequest struct {
	Email string `json:"email"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type UpdateProfileRequest struct {
	Name                string  `json:"name"`
	AvatarURL           string  `json:"avatar_url"`
	Password            *string `json:"password,omitempty"`
	CompanySlug         *string `json:"company_slug,omitempty"`
	CompanyName         *string `json:"company_name,omitempty"`
	CompanyLogoURL      *string `json:"company_logo_url,omitempty"`
	CompanyContactEmail *string `json:"company_contact_email,omitempty"`
}

type AuthResponse struct {
	User      UserResponse `json:"user"`
	CSRFToken string       `json:"csrf_token"`
}

func (h *AuthHandler) RegisterCandidate(w http.ResponseWriter, r *http.Request) {
	var req RegisterCandidateRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if req.Name == "" || req.Email == "" || !strings.Contains(req.Email, "@") {
		httpx.Error(w, http.StatusBadRequest, "full name and a valid email address are required")
		return
	}

	if len(req.Password) < 6 {
		httpx.Error(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}

	existingUser, err := h.userRepo.GetByEmail(r.Context(), req.Email)
	if err == nil && existingUser != nil {
		if existingUser.PasswordHash != "" {
			httpx.Error(w, http.StatusConflict, "An account with this email already exists. Please sign in.")
			return
		}
		// Existing account from Google OAuth (empty password_hash)
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to secure password")
			return
		}
		_ = h.userRepo.SetPassword(r.Context(), existingUser.ID, string(hash))
		if !existingUser.EmailVerified {
			token, _ := generateActivationToken()
			expiresAt := time.Now().Add(24 * time.Hour)
			_ = h.userRepo.SetActivationToken(r.Context(), existingUser.ID, token, expiresAt)
			activationURL := fmt.Sprintf("%s/activate?token=%s", h.frontendURL, token)
			if h.emailSvc != nil {
				_ = h.emailSvc.SendAccountActivationEmail(existingUser.Email, existingUser.Name, activationURL)
			}
			httpx.JSON(w, http.StatusOK, map[string]any{
				"message": "Password saved! Please check your email for the activation link to complete setup.",
				"requires_activation": true,
				"email": existingUser.Email,
			})
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{
			"message": "Password set successfully! You can now sign in using your email and password.",
			"requires_activation": false,
			"email": existingUser.Email,
		})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to secure password")
		return
	}

	activationToken, err := generateActivationToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to generate activation token")
		return
	}
	expiresAt := time.Now().Add(24 * time.Hour)

	user, err := h.userRepo.CreateUnverified(r.Context(), req.Email, string(hash), req.Name, "candidate", nil, activationToken, expiresAt)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create candidate account")
		return
	}

	activationURL := fmt.Sprintf("%s/activate?token=%s", h.frontendURL, activationToken)
	if h.emailSvc != nil {
		_ = h.emailSvc.SendAccountActivationEmail(user.Email, user.Name, activationURL)
	}

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"message": "Registration successful! Please check your email to activate your account.",
		"requires_activation": true,
		"email": user.Email,
	})
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
	req.ContactEmail = strings.ToLower(strings.TrimSpace(req.ContactEmail))
	if req.ContactEmail == "" {
		req.ContactEmail = req.AdminEmail
	}

	if req.CompanyName == "" || req.CompanySlug == "" || req.AdminEmail == "" {
		httpx.Error(w, http.StatusBadRequest, "company name, slug, and admin email are required")
		return
	}

	// If registering with password, enforce min length
	if req.AdminPassword != "" && len(req.AdminPassword) < 6 {
		httpx.Error(w, http.StatusBadRequest, "admin password must be at least 6 characters")
		return
	}

	// 1. Create Organization in approved status so admin can access workspace once activated
	org, err := h.orgRepo.Register(r.Context(), req.CompanySlug, req.CompanyName, req.ContactEmail, req.LogoURL, model.OrgStatusApproved)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to register company")
		return
	}
	_ = h.orgRepo.SetAdminEmail(r.Context(), org.ID, req.AdminEmail, req.ContactEmail)

	// 2. Resolve or Create Admin User
	var user *model.User
	existingUser, err := h.userRepo.GetByEmail(r.Context(), req.AdminEmail)
	requiresActivation := false

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

		// If user provided a password and didn't have one before, set it
		if req.AdminPassword != "" && user.PasswordHash == "" {
			if hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost); err == nil {
				_ = h.userRepo.SetPassword(r.Context(), user.ID, string(hash))
			}
		}

		if !user.EmailVerified {
			requiresActivation = true
			token, _ := generateActivationToken()
			expiresAt := time.Now().Add(24 * time.Hour)
			_ = h.userRepo.SetActivationToken(r.Context(), user.ID, token, expiresAt)
			activationURL := fmt.Sprintf("%s/activate?token=%s", h.frontendURL, token)
			if h.emailSvc != nil {
				_ = h.emailSvc.SendAccountActivationEmail(user.Email, user.Name, activationURL)
			}
		}
	} else {
		// Creating new admin account
		hashStr := ""
		if req.AdminPassword != "" {
			hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to secure password")
				return
			}
			hashStr = string(hash)
			requiresActivation = true
		}

		if requiresActivation {
			token, err := generateActivationToken()
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to generate activation token")
				return
			}
			expiresAt := time.Now().Add(24 * time.Hour)
			user, err = h.userRepo.CreateUnverified(r.Context(), req.AdminEmail, hashStr, req.AdminName, "org_admin", &org.ID, token, expiresAt)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to create admin user")
				return
			}
			activationURL := fmt.Sprintf("%s/activate?token=%s", h.frontendURL, token)
			if h.emailSvc != nil {
				_ = h.emailSvc.SendAccountActivationEmail(user.Email, user.Name, activationURL)
			}
		} else {
			user, err = h.userRepo.Create(r.Context(), req.AdminEmail, hashStr, req.AdminName, "org_admin", &org.ID)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to create admin user")
				return
			}
		}
	}

	if h.emailSvc != nil {
		_ = h.emailSvc.SendRegistrationEmail(user.Email, user.Name, org.Name, "")
	}

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

	if requiresActivation {
		httpx.JSON(w, http.StatusCreated, map[string]any{
			"message":             "Company registered successfully! Please check your admin email to activate your account.",
			"status":              string(org.Status),
			"requires_activation": true,
			"company":             orgInfo,
			"admin_email":         user.Email,
		})
		return
	}

	// For pre-verified (e.g. Google OAuth) accounts, log in immediately
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

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"message":             "Company registered successfully.",
		"status":              string(org.Status),
		"requires_activation": false,
		"company":             orgInfo,
		"user": UserResponse{
			ID:             user.ID.String(),
			OrganizationID: orgIDStr,
			Organization:   orgInfo,
			Email:          user.Email,
			Name:           user.Name,
			AvatarURL:      user.AvatarURL,
			Role:           user.Role,
			EmailVerified:  true,
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

	if !user.EmailVerified {
		httpx.JSON(w, http.StatusForbidden, map[string]any{
			"error":                "Please verify your email address to activate your account. Check your inbox for the activation link.",
			"requires_activation": true,
			"email":                user.Email,
		})
		return
	}

	// Self-heal organization link and admin status
	user, _ = h.userRepo.SyncUserOrgStatus(r.Context(), user)

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
			EmailVerified:  user.EmailVerified,
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

	// Self-heal organization link and admin status
	user, _ = h.userRepo.SyncUserOrgStatus(r.Context(), user)

	// If role was healed or organization newly linked, refresh auth cookie
	if user.Role != claims.Role || (user.OrganizationID != nil && claims.OrganizationID == nil) {
		if newToken, err := h.authSvc.GenerateToken(user.ID, user.OrganizationID, user.Email, user.Role); err == nil {
			if newCsrf, err := auth.GenerateCSRFToken(); err == nil {
				auth.SetAuthCookies(w, newToken, newCsrf, h.cookieOpts)
			}
		}
	}

	var orgIDStr *string
	var orgInfo *OrganizationInfo
	targetOrgID := user.OrganizationID

	if targetOrgID != nil {
		s := targetOrgID.String()
		orgIDStr = &s

		org, err := h.orgRepo.GetByID(r.Context(), *targetOrgID)
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
	targetOrgID := user.OrganizationID

	if targetOrgID != nil {
		currentOrg, err := h.orgRepo.GetByID(r.Context(), *targetOrgID)
		if err == nil && currentOrg != nil {
			newSlug := currentOrg.Slug
			if req.CompanySlug != nil && strings.TrimSpace(*req.CompanySlug) != "" {
				newSlug = strings.ToLower(strings.TrimSpace(*req.CompanySlug))
			}
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

			updatedOrg, err := h.orgRepo.Update(r.Context(), currentOrg.ID, newSlug, newOrgName, newContactEmail, newLogoURL)
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, err.Error())
				return
			}
			if updatedOrg != nil {
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
		EmailVerified:  user.EmailVerified,
	})
}

func (h *AuthHandler) ActivateAccount(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" && r.Method == http.MethodPost {
		var req ActivateAccountRequest
		_ = httpx.Decode(w, r, &req)
		token = strings.TrimSpace(req.Token)
	}

	if token == "" {
		httpx.Error(w, http.StatusBadRequest, "activation token is required")
		return
	}

	user, err := h.userRepo.GetByActivationToken(r.Context(), token)
	if err != nil || user == nil {
		httpx.Error(w, http.StatusBadRequest, "Invalid or expired activation link. Please request a new activation email.")
		return
	}

	if user.ActivationExpiresAt != nil && time.Now().After(*user.ActivationExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, "This activation link has expired. Please request a new activation link.")
		return
	}

	if err := h.userRepo.ActivateUser(r.Context(), user.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to activate account")
		return
	}
	user.EmailVerified = true

	// Self-heal organization link and admin status
	user, _ = h.userRepo.SyncUserOrgStatus(r.Context(), user)

	sessionToken, err := h.authSvc.GenerateToken(user.ID, user.OrganizationID, user.Email, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue session token")
		return
	}

	csrfToken, err := auth.GenerateCSRFToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue csrf token")
		return
	}

	auth.SetAuthCookies(w, sessionToken, csrfToken, h.cookieOpts)

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
		}
	}

	var orgIDStr *string
	if user.OrganizationID != nil {
		s := user.OrganizationID.String()
		orgIDStr = &s
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "Account activated successfully!",
		"user": UserResponse{
			ID:             user.ID.String(),
			OrganizationID: orgIDStr,
			Organization:   orgInfo,
			Email:          user.Email,
			Name:           user.Name,
			AvatarURL:      user.AvatarURL,
			Role:           user.Role,
			EmailVerified:  true,
		},
		"csrf_token": csrfToken,
	})
}

func (h *AuthHandler) ResendActivation(w http.ResponseWriter, r *http.Request) {
	var req ResendActivationRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || !strings.Contains(email, "@") {
		httpx.Error(w, http.StatusBadRequest, "valid email address is required")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), email)
	if err != nil || user == nil {
		// Do not reveal whether email exists
		httpx.JSON(w, http.StatusOK, map[string]string{
			"message": "If an unactivated account exists with this email, an activation link has been sent.",
		})
		return
	}

	if user.EmailVerified {
		httpx.Error(w, http.StatusBadRequest, "This account is already activated. Please sign in.")
		return
	}

	token, err := generateActivationToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to generate activation token")
		return
	}
	expiresAt := time.Now().Add(24 * time.Hour)

	if err := h.userRepo.SetActivationToken(r.Context(), user.ID, token, expiresAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update activation token")
		return
	}

	activationURL := fmt.Sprintf("%s/activate?token=%s", h.frontendURL, token)
	if h.emailSvc != nil {
		_ = h.emailSvc.SendAccountActivationEmail(user.Email, user.Name, activationURL)
	}

	httpx.JSON(w, http.StatusOK, map[string]string{
		"message": "A new activation link has been sent to your email. Please check your inbox.",
	})
}

func generateActivationToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ------------------------------------------------------------------------------------------------
// Public Invitation Verification & Acceptance
// ------------------------------------------------------------------------------------------------

type AcceptInvitationRequest struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (h *AuthHandler) GetInvitation(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	if token == "" {
		httpx.Error(w, http.StatusBadRequest, "invitation token is required")
		return
	}

	ctx := r.Context()
	inv, err := h.invitationRepo.GetByToken(ctx, token)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "invalid or non-existent invitation token")
		return
	}

	if inv.Status != model.InvitationStatusPending {
		httpx.Error(w, http.StatusBadRequest, "this invitation has already been "+inv.Status)
		return
	}

	if time.Now().After(inv.ExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, "this invitation has expired")
		return
	}

	existingUser, _ := h.userRepo.GetByEmail(ctx, inv.Email)
	isExistingUser := existingUser != nil

	httpx.JSON(w, http.StatusOK, map[string]any{
		"id":                inv.ID,
		"email":             inv.Email,
		"role":              inv.Role,
		"organization_name": inv.OrganizationName,
		"organization_slug": inv.OrganizationSlug,
		"organization_logo": inv.OrganizationLogo,
		"invited_by_name":   inv.InvitedByName,
		"expires_at":        inv.ExpiresAt,
		"is_existing_user":  isExistingUser,
	})
}

func (h *AuthHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	if token == "" {
		httpx.Error(w, http.StatusBadRequest, "invitation token is required")
		return
	}

	ctx := r.Context()
	inv, err := h.invitationRepo.GetByToken(ctx, token)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "invalid or non-existent invitation token")
		return
	}

	if inv.Status != model.InvitationStatusPending {
		httpx.Error(w, http.StatusBadRequest, "this invitation has already been "+inv.Status)
		return
	}

	if time.Now().After(inv.ExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, "this invitation has expired")
		return
	}

	var req AcceptInvitationRequest
	_ = httpx.Decode(w, r, &req)

	req.Name = strings.TrimSpace(req.Name)
	req.Password = strings.TrimSpace(req.Password)

	existingUser, _ := h.userRepo.GetByEmail(ctx, inv.Email)

	var user *model.User
	if existingUser != nil {
		// Existing user: promote role and assign organization
		userName := existingUser.Name
		if req.Name != "" {
			userName = req.Name
		}
		if req.Password != "" {
			if len(req.Password) < 6 {
				httpx.Error(w, http.StatusBadRequest, "password must be at least 6 characters")
				return
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to hash password")
				return
			}
			_ = h.userRepo.SetPassword(ctx, existingUser.ID, string(hash))
		}

		if err := h.userRepo.UpdateOrgAndRole(ctx, existingUser.ID, inv.OrganizationID, inv.Role, userName); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to update user permissions: "+err.Error())
			return
		}
		_ = h.userRepo.ActivateUser(ctx, existingUser.ID)

		user, _ = h.userRepo.GetByID(ctx, existingUser.ID)
		if user == nil {
			user = existingUser
			user.Role = inv.Role
			user.OrganizationID = inv.OrganizationID
			user.EmailVerified = true
		}
	} else {
		// New user: create account
		if req.Password == "" {
			httpx.Error(w, http.StatusBadRequest, "password is required to set up your account")
			return
		}
		if len(req.Password) < 6 {
			httpx.Error(w, http.StatusBadRequest, "password must be at least 6 characters")
			return
		}
		if req.Name == "" {
			req.Name = strings.Split(inv.Email, "@")[0]
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to hash password")
			return
		}

		user, err = h.userRepo.Create(ctx, inv.Email, string(hash), req.Name, inv.Role, inv.OrganizationID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to create user account: "+err.Error())
			return
		}
	}

	// Mark invitation accepted
	_ = h.invitationRepo.UpdateStatus(ctx, inv.ID, model.InvitationStatusAccepted)

	// Issue JWT & CSRF cookies
	jwtToken, err := h.authSvc.GenerateToken(user.ID, user.OrganizationID, user.Email, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue session token")
		return
	}

	csrfToken, err := auth.GenerateCSRFToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to issue csrf token")
		return
	}

	auth.SetAuthCookies(w, jwtToken, csrfToken, h.cookieOpts)

	// If invitation was tied to a program and user is mentor, auto-assign
	if inv.ProgramID != nil && h.mentorRepo != nil {
		_, _ = h.mentorRepo.AssignMentor(ctx, *inv.ProgramID, user.ID, "Mentor", "")
	}

	redirectURL := "/admin/dashboard"
	if user.Role == model.RoleSuperadmin {
		redirectURL = "/superadmin/dashboard"
	} else if user.Role == model.RoleMentor {
		redirectURL = "/mentor/dashboard"
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":      "Invitation accepted successfully! Welcome to the team.",
		"user":         user,
		"redirect_url": redirectURL,
		"csrf_token":   csrfToken,
	})
}

// ------------------------------------------------------------------------------------------------
// Forgot & Reset Password
// ------------------------------------------------------------------------------------------------

// ForgotPassword handles sending a password reset email to a user.
// Returns a generic success message to prevent user enumeration attacks.
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || !strings.Contains(email, "@") {
		httpx.Error(w, http.StatusBadRequest, "valid email address is required")
		return
	}

	genericSuccessMsg := "If an account exists with this email address, you will receive password reset instructions shortly."

	user, err := h.userRepo.GetByEmail(r.Context(), email)
	if err != nil || user == nil {
		// Anti-enumeration: Return 200 OK without disclosing whether the email exists
		httpx.JSON(w, http.StatusOK, map[string]string{
			"message": genericSuccessMsg,
		})
		return
	}

	token, err := generateActivationToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to generate reset token")
		return
	}
	expiresAt := time.Now().Add(1 * time.Hour)

	if err := h.userRepo.SetPasswordResetToken(r.Context(), user.ID, token, expiresAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to initiate password reset")
		return
	}

	resetURL := fmt.Sprintf("%s/reset-password?token=%s", h.frontendURL, token)
	if h.emailSvc != nil {
		go func() {
			_ = h.emailSvc.SendPasswordResetEmail(user.Email, user.Name, resetURL)
		}()
	}

	httpx.JSON(w, http.StatusOK, map[string]string{
		"message": genericSuccessMsg,
	})
}

// VerifyResetToken validates a password reset token without consuming it.
func (h *AuthHandler) VerifyResetToken(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		httpx.Error(w, http.StatusBadRequest, "reset token is required")
		return
	}

	user, err := h.userRepo.GetByPasswordResetToken(r.Context(), token)
	if err != nil || user == nil {
		httpx.Error(w, http.StatusBadRequest, "This password reset link is invalid or has expired. Please request a new one.")
		return
	}

	if user.PasswordResetExpiresAt != nil && time.Now().After(*user.PasswordResetExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, "This password reset link has expired. Please request a new one.")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"valid": true,
		"email": maskEmail(user.Email),
	})
}

// ResetPassword consumes the reset token and sets the user's new password.
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	token := strings.TrimSpace(req.Token)
	if token == "" {
		httpx.Error(w, http.StatusBadRequest, "reset token is required")
		return
	}

	if len(req.Password) < 8 {
		httpx.Error(w, http.StatusBadRequest, "password must be at least 8 characters long")
		return
	}

	user, err := h.userRepo.GetByPasswordResetToken(r.Context(), token)
	if err != nil || user == nil {
		httpx.Error(w, http.StatusBadRequest, "This password reset link is invalid or has expired. Please request a new one.")
		return
	}

	if user.PasswordResetExpiresAt != nil && time.Now().After(*user.PasswordResetExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, "This password reset link has expired. Please request a new one.")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to secure password")
		return
	}

	if err := h.userRepo.ResetPassword(r.Context(), user.ID, string(hash)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update password")
		return
	}

	// If account had unverified email, verify it since they verified email ownership via reset token
	if !user.EmailVerified {
		_ = h.userRepo.ActivateUser(r.Context(), user.ID)
	}

	httpx.JSON(w, http.StatusOK, map[string]string{
		"message": "Your password has been successfully reset. You may now sign in with your new password.",
	})
}

func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return email
	}
	name, domain := parts[0], parts[1]
	if len(name) <= 2 {
		return name[:1] + "***@" + domain
	}
	return name[:2] + "***@" + domain
}

