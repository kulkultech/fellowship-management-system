package repository

import (
	"context"
	"errors"
	"fmt"
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
		RETURNING id, organization_id, email, password_hash, name, role, created_at, updated_at
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, orgID, email, passwordHash, name, role).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("user_repo: create: %w", err)
	}
	return &u, nil
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
		SELECT id, organization_id, email, password_hash, name, role, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt,
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
		SELECT id, organization_id, email, password_hash, name, role, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u model.User
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt,
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

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if u, ok := r.memUsers[email]; ok {
			return u, nil
		}
		orgID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
		u := &model.User{
			ID:             uuid.New(),
			OrganizationID: &orgID,
			Email:          email,
			Name:           name,
			Role:           "org_admin",
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		}
		r.memUsers[email] = u
		return u, nil
	}

	// 1. Check if user already exists
	u, err := r.GetByEmail(ctx, email)
	if err == nil && u != nil {
		return u, nil
	}

	// 2. Ensure a valid organization exists in PostgreSQL (or auto-seed RSA)
	var orgID *uuid.UUID
	var foundID uuid.UUID
	err = r.pool.QueryRow(ctx, "SELECT id FROM organizations WHERE slug = 'rsa' LIMIT 1").Scan(&foundID)
	if err == nil {
		orgID = &foundID
	} else {
		err = r.pool.QueryRow(ctx, "SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1").Scan(&foundID)
		if err == nil {
			orgID = &foundID
		} else {
			// Auto-seed default RSA organization so foreign key constraint never fails
			err = r.pool.QueryRow(ctx, `
				INSERT INTO organizations (slug, name, logo_url, status, contact_email, created_at, updated_at)
				VALUES ('rsa', 'Remote Skills Academy', '', 'approved', 'contact@rsa.org', now(), now())
				ON CONFLICT (slug) DO UPDATE SET logo_url = '', updated_at = now()
				RETURNING id
			`).Scan(&foundID)
			if err == nil {
				orgID = &foundID
			}
		}
	}

	role := "org_admin"
	if email == "superadmin@fellowhire.com" {
		role = "superadmin"
		orgID = nil
	}

	// 3. Atomically upsert user
	query := `
		INSERT INTO users (organization_id, email, password_hash, name, role, created_at, updated_at)
		VALUES ($1, $2, '', $3, $4, now(), now())
		ON CONFLICT (email) DO UPDATE SET
			name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END,
			updated_at = now()
		RETURNING id, organization_id, email, password_hash, name, role, created_at, updated_at
	`
	var user model.User
	err = r.pool.QueryRow(ctx, query, orgID, email, name, role).Scan(
		&user.ID, &user.OrganizationID, &user.Email, &user.PasswordHash, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("user_repo: oauth create/upsert: %w", err)
	}
	return &user, nil
}

