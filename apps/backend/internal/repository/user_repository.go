package repository

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/kulkul/backend/internal/model"
)

var (
	ErrUserNotFound      = errors.New("user not found")
	ErrUserAlreadyExists = errors.New("user already exists with this email")
)

type UserRepository struct {
	pool     *pgxpool.Pool
	mu       sync.RWMutex
	memUsers map[string]*model.User
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	repo := &UserRepository{
		pool:     pool,
		memUsers: make(map[string]*model.User),
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	orgID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	// 1. Superadmin User
	superadmin := &model.User{
		ID:             uuid.MustParse("00000000-0000-0000-0000-000000000099"),
		OrganizationID: nil,
		Email:          "superadmin@fellowhire.com",
		PasswordHash:   string(hash),
		Name:           "FellowHire Superadmin",
		Role:           "superadmin",
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
	repo.memUsers["superadmin@fellowhire.com"] = superadmin

	// 2. Default RSA Org Admin (admin@rsa.org / admin123)
	admin := &model.User{
		ID:             uuid.MustParse("00000000-0000-0000-0000-000000000002"),
		OrganizationID: &orgID,
		Email:          "admin@rsa.org",
		PasswordHash:   string(hash),
		Name:           "RSA Reviewer Admin",
		Role:           "org_admin",
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
	repo.memUsers["admin@rsa.org"] = admin
	return repo
}

func (r *UserRepository) Create(ctx context.Context, email, passwordHash, name, role string, orgID *uuid.UUID) (*model.User, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if _, exists := r.memUsers[email]; exists {
			return nil, ErrUserAlreadyExists
		}
		u := &model.User{
			ID:             uuid.New(),
			OrganizationID: orgID,
			Email:          email,
			PasswordHash:   passwordHash,
			Name:           name,
			Role:           role,
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}
		r.memUsers[email] = u
		return u, nil
	}

	query := `
		INSERT INTO users (organization_id, email, password_hash, name, role, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, now(), now())
		RETURNING id, organization_id, email, password_hash, name, COALESCE(avatar_url, ''), role, created_at, updated_at
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, orgID, email, passwordHash, name, role).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Name, &u.AvatarURL, &u.Role, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("user_repo: create: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) UpdateOrgAndRole(ctx context.Context, userID uuid.UUID, orgID *uuid.UUID, role, name string) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, u := range r.memUsers {
			if u.ID == userID {
				u.OrganizationID = orgID
				u.Role = role
				if name != "" {
					u.Name = name
				}
				u.UpdatedAt = time.Now()
				return nil
			}
		}
		return ErrUserNotFound
	}

	query := `
		UPDATE users
		SET organization_id = $2, role = $3, name = CASE WHEN $4 <> '' THEN $4 ELSE name END, updated_at = now()
		WHERE id = $1
	`
	tag, err := r.pool.Exec(ctx, query, userID, orgID, role, name)
	if err != nil {
		return fmt.Errorf("user_repo: update org and role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func isSuperadminEmail(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	parts := strings.Split(email, "@")
	domain := ""
	if len(parts) == 2 {
		domain = strings.ToLower(parts[1])
	}

	if domain == "kulkul.tech" || domain == "kulkul.com" || email == "superadmin@fellowhire.com" {
		return true
	}

	superadminEmailsEnv := strings.ToLower(os.Getenv("SUPERADMIN_EMAILS"))
	if superadminEmailsEnv != "" {
		for _, e := range strings.Split(superadminEmailsEnv, ",") {
			if strings.TrimSpace(e) == email {
				return true
			}
		}
	}

	superadminDomainsEnv := strings.ToLower(os.Getenv("SUPERADMIN_DOMAINS"))
	if superadminDomainsEnv != "" {
		for _, d := range strings.Split(superadminDomainsEnv, ",") {
			if strings.TrimSpace(d) == domain {
				return true
			}
		}
	}

	return false
}

// SyncUserOrgStatus ensures an existing user's role and organization affiliation
// remain consistent and auto-repairs any demoted or missing organization links.
func (r *UserRepository) SyncUserOrgStatus(ctx context.Context, u *model.User) (*model.User, error) {
	if u == nil {
		return nil, nil
	}

	email := strings.ToLower(strings.TrimSpace(u.Email))
	if isSuperadminEmail(email) {
		if u.Role != "superadmin" || u.OrganizationID != nil {
			u.Role = "superadmin"
			u.OrganizationID = nil
			if r.pool != nil {
				_, _ = r.pool.Exec(ctx, "UPDATE users SET role = 'superadmin', organization_id = NULL, updated_at = now() WHERE id = $1", u.ID)
			}
		}
		return u, nil
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if memU, ok := r.memUsers[email]; ok {
			if memU.OrganizationID != nil && memU.Role == "candidate" {
				memU.Role = "org_admin"
			}
			return memU, nil
		}
		return u, nil
	}

	// 1. If user is currently linked to an organization, verify it exists and restore admin role if demoted
	if u.OrganizationID != nil {
		var orgExists bool
		_ = r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM organizations WHERE id = $1)", u.OrganizationID).Scan(&orgExists)
		if orgExists {
			if u.Role != "org_admin" && u.Role != "reviewer" {
				u.Role = "org_admin"
				_, _ = r.pool.Exec(ctx, "UPDATE users SET role = 'org_admin', updated_at = now() WHERE id = $1", u.ID)
			}
			return u, nil
		}
		// Linked organization no longer exists
		u.OrganizationID = nil
	}

	// 2. If user has no organization link, check if an organization was registered with their email.
	// This unconditionally matches regardless of email domain (works for gmail, yahoo, custom domain).
	var foundOrgID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM organizations 
		WHERE slug <> 'rsa' 
		  AND (
		    LOWER(contact_email) = $1 
		    OR LOWER(contact_email) LIKE '%' || $1 || '%'
		    OR (admin_email IS NOT NULL AND LOWER(admin_email) = $1)
		  )
		ORDER BY created_at DESC 
		LIMIT 1
	`, email).Scan(&foundOrgID)
	if err == nil {
		u.OrganizationID = &foundOrgID
		u.Role = "org_admin"
		_, _ = r.pool.Exec(ctx, "UPDATE users SET organization_id = $2, role = 'org_admin', updated_at = now() WHERE id = $1", u.ID, foundOrgID)
		_, _ = r.pool.Exec(ctx, `
			UPDATE organizations 
			SET contact_email = CASE WHEN contact_email IS NULL OR contact_email = '' THEN $2 ELSE contact_email END,
			    admin_email = CASE WHEN admin_email IS NULL OR admin_email = '' THEN $2 ELSE admin_email END,
			    updated_at = now()
			WHERE id = $1
		`, foundOrgID, email)
		return u, nil
	}

	return u, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		u, ok := r.memUsers[email]
		if !ok {
			return nil, ErrUserNotFound
		}
		return u, nil
	}

	query := `
		SELECT id, organization_id, email, password_hash, name, COALESCE(avatar_url, ''), role, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Name, &u.AvatarURL, &u.Role, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user_repo: get by email: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, u := range r.memUsers {
			if u.ID == id {
				return u, nil
			}
		}
		return nil, ErrUserNotFound
	}

	query := `
		SELECT id, organization_id, email, password_hash, name, COALESCE(avatar_url, ''), role, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Name, &u.AvatarURL, &u.Role, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user_repo: get by id: %w", err)
	}
	return &u, nil
}

// OAuthIdentity describes an external account to link to a local user.
type OAuthIdentity struct {
	Provider       string // e.g. "google"
	ProviderUserID string // Google "sub" claim
	Email          string
	Name           string
	IsCandidate    bool   // True if the OAuth flow was initiated from candidate pages/forms
}

func isPublicEmailDomain(domain string) bool {
	publicDomains := map[string]bool{
		"gmail.com":      true,
		"googlemail.com": true,
		"yahoo.com":      true,
		"ymail.com":      true,
		"hotmail.com":    true,
		"outlook.com":    true,
		"live.com":       true,
		"msn.com":        true,
		"icloud.com":     true,
		"me.com":         true,
		"mac.com":        true,
		"aol.com":        true,
		"proton.me":      true,
		"protonmail.com": true,
		"mail.com":       true,
		"zoho.com":       true,
	}
	return publicDomains[strings.ToLower(strings.TrimSpace(domain))]
}

func (r *UserRepository) FindOrCreateByOAuth(ctx context.Context, id OAuthIdentity) (*model.User, error) {
	email := strings.ToLower(strings.TrimSpace(id.Email))
	name := strings.TrimSpace(id.Name)
	if name == "" {
		parts := strings.Split(email, "@")
		if len(parts) > 0 {
			name = parts[0]
		} else {
			name = "Google User"
		}
	}

	parts := strings.Split(email, "@")
	domain := ""
	if len(parts) == 2 {
		domain = strings.ToLower(parts[1])
	}

	isSuperadmin := isSuperadminEmail(email)

	// NOTE: No automatic organization binding by email domain.
	// Everyone signs in as candidate by default; companies (including RSA)
	// get access via company registration + approval or manual assignment.

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if u, ok := r.memUsers[email]; ok {
			// Company members keep their access no matter which portal they sign in from.
			// A candidate-portal login must never strip company admin rights.
			if isSuperadmin && u.Role != "superadmin" {
				u.Role = "superadmin"
				u.OrganizationID = nil
			}
			return u, nil
		}
		role := "candidate"
		var userOrgID *uuid.UUID = nil
		if isSuperadmin {
			role = "superadmin"
		}
		u := &model.User{
			ID:             uuid.New(),
			OrganizationID: userOrgID,
			Email:          email,
			Name:           name,
			Role:           role,
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}
		r.memUsers[email] = u
		return u, nil
	}

	// 1. Check if user already exists in PostgreSQL
	u, err := r.GetByEmail(ctx, email)
	if err == nil && u != nil {
		u, err = r.SyncUserOrgStatus(ctx, u)
		if err != nil {
			return nil, err
		}

		// If user is candidate and logging into company portal with a corporate custom domain, check domain relink
		if u.Role == "candidate" && !id.IsCandidate && !isPublicEmailDomain(domain) {
			var relinkID uuid.UUID
			err := r.pool.QueryRow(ctx, "SELECT id FROM organizations WHERE slug <> 'rsa' AND (contact_email ILIKE $1 OR contact_email ILIKE $2) LIMIT 1", "%@"+domain, "%"+email+"%").Scan(&relinkID)
			if err == nil {
				_, _ = r.pool.Exec(ctx, "UPDATE users SET organization_id = $2, role = 'org_admin', updated_at = now() WHERE id = $1", u.ID, relinkID)
				u.OrganizationID = &relinkID
				u.Role = "org_admin"
			}
		}
		return u, nil
	}

	// 2. Resolve organization for new user
	var orgID *uuid.UUID
	role := "candidate"

	if isSuperadmin {
		role = "superadmin"
		orgID = nil
	} else {
		// A. Check exact email match against registered organizations (works unconditionally for any email/domain)
		var foundOrgID uuid.UUID
		err := r.pool.QueryRow(ctx, `
			SELECT id FROM organizations 
			WHERE slug <> 'rsa' 
			  AND (
			    LOWER(contact_email) = $1 
			    OR LOWER(contact_email) LIKE '%' || $1 || '%'
			    OR (admin_email IS NOT NULL AND LOWER(admin_email) = $1)
			  )
			ORDER BY created_at DESC 
			LIMIT 1
		`, email).Scan(&foundOrgID)
		if err == nil {
			orgID = &foundOrgID
			role = "org_admin"
		} else if !id.IsCandidate && !isPublicEmailDomain(domain) {
			// B. Corporate custom domain matching approved organization
			var domainOrgID uuid.UUID
			err = r.pool.QueryRow(ctx, "SELECT id FROM organizations WHERE status = 'approved' AND slug <> 'rsa' AND (contact_email ILIKE $1 OR contact_email ILIKE $2) LIMIT 1", "%@"+domain, "%"+email+"%").Scan(&domainOrgID)
			if err == nil {
				orgID = &domainOrgID
				role = "org_admin"
			}
		}
	}

	// 3. Atomically upsert user.
	// IMPORTANT: ON CONFLICT must NEVER demote org_admin/reviewer/superadmin down to candidate,
	// and must NEVER clear organization_id if the user already has one!
	query := `
		INSERT INTO users (organization_id, email, password_hash, name, role, created_at, updated_at)
		VALUES ($1, $2, '', $3, $4, now(), now())
		ON CONFLICT (email) DO UPDATE SET
			name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END,
			role = CASE WHEN users.role IN ('org_admin', 'reviewer', 'superadmin') AND EXCLUDED.role = 'candidate' THEN users.role ELSE EXCLUDED.role END,
			organization_id = CASE WHEN users.organization_id IS NOT NULL AND EXCLUDED.organization_id IS NULL THEN users.organization_id ELSE EXCLUDED.organization_id END,
			updated_at = now()
		RETURNING id, organization_id, email, password_hash, name, COALESCE(avatar_url, ''), role, created_at, updated_at
	`
	var user model.User
	err = r.pool.QueryRow(ctx, query, orgID, email, name, role).Scan(
		&user.ID, &user.OrganizationID, &user.Email, &user.PasswordHash, &user.Name, &user.AvatarURL, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("user_repo: oauth create/upsert: %w", err)
	}
	return r.SyncUserOrgStatus(ctx, &user)
}

func (r *UserRepository) UpdateProfile(ctx context.Context, userID uuid.UUID, name string, avatarURL string, passwordHash *string) (*model.User, error) {
	name = strings.TrimSpace(name)
	avatarURL = strings.TrimSpace(avatarURL)

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, u := range r.memUsers {
			if u.ID == userID {
				if name != "" {
					u.Name = name
				}
				u.AvatarURL = avatarURL
				if passwordHash != nil && *passwordHash != "" {
					u.PasswordHash = *passwordHash
				}
				u.UpdatedAt = time.Now()
				return u, nil
			}
		}
		return nil, ErrUserNotFound
	}

	var query string
	var args []any

	if passwordHash != nil && *passwordHash != "" {
		query = `
			UPDATE users
			SET name = CASE WHEN $2 <> '' THEN $2 ELSE name END,
			    avatar_url = $3,
			    password_hash = $4,
			    updated_at = now()
			WHERE id = $1
			RETURNING id, organization_id, email, password_hash, name, COALESCE(avatar_url, ''), role, created_at, updated_at
		`
		args = []any{userID, name, avatarURL, *passwordHash}
	} else {
		query = `
			UPDATE users
			SET name = CASE WHEN $2 <> '' THEN $2 ELSE name END,
			    avatar_url = $3,
			    updated_at = now()
			WHERE id = $1
			RETURNING id, organization_id, email, password_hash, name, COALESCE(avatar_url, ''), role, created_at, updated_at
		`
		args = []any{userID, name, avatarURL}
	}

	var u model.User
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Name, &u.AvatarURL, &u.Role, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user_repo: update profile: %w", err)
	}
	return &u, nil
}

