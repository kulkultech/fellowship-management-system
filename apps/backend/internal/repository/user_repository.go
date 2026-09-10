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

	// Environment-based whitelist overrides
	superadminEmailsEnv := strings.ToLower(os.Getenv("SUPERADMIN_EMAILS"))
	superadminDomainsEnv := strings.ToLower(os.Getenv("SUPERADMIN_DOMAINS"))

	isSuperadmin := false
	if domain == "kulkul.tech" || domain == "kulkul.com" {
		isSuperadmin = true
	}
	if email == "superadmin@fellowhire.com" {
		isSuperadmin = true
	}
	if superadminDomainsEnv != "" {
		for _, d := range strings.Split(superadminDomainsEnv, ",") {
			if strings.TrimSpace(d) == domain {
				isSuperadmin = true
				break
			}
		}
	}
	if superadminEmailsEnv != "" {
		for _, e := range strings.Split(superadminEmailsEnv, ",") {
			if strings.TrimSpace(e) == email {
				isSuperadmin = true
				break
			}
		}
	}

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
		// If user role needs upgrade based on whitelist
		if isSuperadmin && u.Role != "superadmin" {
			_, _ = r.pool.Exec(ctx, "UPDATE users SET role = 'superadmin', organization_id = NULL, updated_at = now() WHERE id = $1", u.ID)
			u.Role = "superadmin"
			u.OrganizationID = nil
		} else if !isSuperadmin && u.OrganizationID != nil {
			// Company members keep their access regardless of which portal they sign in from.
			// A candidate-portal login must never strip company admin rights.
			var hasOrg bool
			_ = r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM organizations WHERE id = $1)", u.OrganizationID).Scan(&hasOrg)
			if !hasOrg {
				// If the linked org was deleted, check if another org matches contact email
				var fallbackOrgID uuid.UUID
				err := r.pool.QueryRow(ctx, "SELECT id FROM organizations WHERE contact_email ILIKE $1 OR contact_email ILIKE $2 LIMIT 1", email, "%"+email+"%").Scan(&fallbackOrgID)
				if err == nil {
					_, _ = r.pool.Exec(ctx, "UPDATE users SET organization_id = $2, updated_at = now() WHERE id = $1", u.ID, fallbackOrgID)
					u.OrganizationID = &fallbackOrgID
				}
			}
		} else if !isSuperadmin && (u.Role == "org_admin" || u.Role == "reviewer") {
			// The user is an admin/reviewer whose organization link was missing.
			// Relink to the organization they registered.
			var relinkID uuid.UUID
			err := r.pool.QueryRow(ctx, "SELECT id FROM organizations WHERE contact_email ILIKE $1 OR contact_email ILIKE $2 LIMIT 1", email, "%"+email+"%").Scan(&relinkID)
			if err == nil {
				_, _ = r.pool.Exec(ctx, "UPDATE users SET organization_id = $2, updated_at = now() WHERE id = $1", u.ID, relinkID)
				u.OrganizationID = &relinkID
			}
			// Do NOT demote to candidate.
		} else if !isSuperadmin {
			// Candidate on record. If logging into company portal with a corporate email matching an organization, relink.
			if !id.IsCandidate && !isPublicEmailDomain(domain) {
				var relinkID uuid.UUID
				err := r.pool.QueryRow(ctx, "SELECT id FROM organizations WHERE slug <> 'rsa' AND (contact_email ILIKE $1 OR contact_email ILIKE $2) LIMIT 1", "%@"+domain, "%"+email+"%").Scan(&relinkID)
				if err == nil {
					_, _ = r.pool.Exec(ctx, "UPDATE users SET organization_id = $2, role = 'org_admin', updated_at = now() WHERE id = $1", u.ID, relinkID)
					u.OrganizationID = &relinkID
					u.Role = "org_admin"
				}
			}
		}
		return u, nil
	}

	// 2. Resolve organization based on domain or approved company
	var orgID *uuid.UUID
	var foundID uuid.UUID
	role := "candidate"

	if isSuperadmin {
		role = "superadmin"
		orgID = nil
	} else if id.IsCandidate {
		// Candidate signups are strictly candidates without an organization
		role = "candidate"
		orgID = nil
	} else if !isPublicEmailDomain(domain) {
		// Only corporate custom domains (non-public webmail) can match an approved organization's domain.
		// The seed 'rsa' org is excluded so nobody auto-binds to RSA; RSA access is seed/manual only.
		err = r.pool.QueryRow(ctx, "SELECT id FROM organizations WHERE status = 'approved' AND slug <> 'rsa' AND (contact_email ILIKE $1 OR contact_email ILIKE $2) LIMIT 1", "%@"+domain, "%"+email+"%").Scan(&foundID)
		if err == nil {
			orgID = &foundID
			role = "org_admin"
		}
	}

	// 3. Atomically upsert user
	query := `
		INSERT INTO users (organization_id, email, password_hash, name, role, created_at, updated_at)
		VALUES ($1, $2, '', $3, $4, now(), now())
		ON CONFLICT (email) DO UPDATE SET
			name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END,
			role = EXCLUDED.role,
			organization_id = EXCLUDED.organization_id,
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
	return &user, nil
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

