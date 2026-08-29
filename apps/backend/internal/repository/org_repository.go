package repository

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kulkul/backend/internal/model"
)

var ErrOrgNotFound = errors.New("organization not found")

type OrgRepository struct {
	pool    *pgxpool.Pool
	mu      sync.RWMutex
	memOrgs map[string]*model.Organization
}

func NewOrgRepository(pool *pgxpool.Pool) *OrgRepository {
	repo := &OrgRepository{
		pool:    pool,
		memOrgs: make(map[string]*model.Organization),
	}
	// Pre-seed default RSA organization for in-memory mode
	defaultOrg := &model.Organization{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Slug:      "rsa",
		Name:      "Remote Skills Academy (RSA)",
		LogoURL:   "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=128&h=128&fit=crop",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	repo.memOrgs["rsa"] = defaultOrg
	return repo
}

func (r *OrgRepository) Create(ctx context.Context, slug, name, logoURL string) (*model.Organization, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		org := &model.Organization{
			ID:        uuid.New(),
			Slug:      slug,
			Name:      name,
			LogoURL:   logoURL,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		r.memOrgs[slug] = org
		return org, nil
	}

	query := `
		INSERT INTO organizations (slug, name, logo_url, created_at, updated_at)
		VALUES ($1, $2, $3, now(), now())
		ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, logo_url = EXCLUDED.logo_url, updated_at = now()
		RETURNING id, slug, name, logo_url, created_at, updated_at
	`
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, slug, name, logoURL).Scan(
		&o.ID, &o.Slug, &o.Name, &o.LogoURL, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("org_repo: create: %w", err)
	}
	return &o, nil
}

func (r *OrgRepository) GetBySlug(ctx context.Context, slug string) (*model.Organization, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		org, ok := r.memOrgs[slug]
		if !ok {
			return nil, ErrOrgNotFound
		}
		return org, nil
	}

	query := `
		SELECT id, slug, name, logo_url, created_at, updated_at
		FROM organizations
		WHERE slug = $1
	`
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, slug).Scan(
		&o.ID, &o.Slug, &o.Name, &o.LogoURL, &o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOrgNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("org_repo: get by slug: %w", err)
	}
	return &o, nil
}

func (r *OrgRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Organization, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, org := range r.memOrgs {
			if org.ID == id {
				return org, nil
			}
		}
		return nil, ErrOrgNotFound
	}

	query := `
		SELECT id, slug, name, logo_url, created_at, updated_at
		FROM organizations
		WHERE id = $1
	`
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&o.ID, &o.Slug, &o.Name, &o.LogoURL, &o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOrgNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("org_repo: get by id: %w", err)
	}
	return &o, nil
}
