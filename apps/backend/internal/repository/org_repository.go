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
	// Pre-seed default RSA organization (pre-approved) for in-memory mode
	defaultOrg := &model.Organization{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Slug:         "rsa",
		Name:         "Remote Skills Academy (RSA)",
		ContactEmail: "contact@rsa.org",
		LogoURL:      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=128&h=128&fit=crop",
		Status:       model.OrgStatusApproved,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	repo.memOrgs["rsa"] = defaultOrg
	return repo
}

func (r *OrgRepository) Create(ctx context.Context, slug, name, logoURL string) (*model.Organization, error) {
	return r.Register(ctx, slug, name, "", logoURL, model.OrgStatusApproved)
}

func (r *OrgRepository) Register(ctx context.Context, slug, name, contactEmail, logoURL string, status model.OrgStatus) (*model.Organization, error) {
	if status == "" {
		status = model.OrgStatusPendingApproval
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if existing, ok := r.memOrgs[slug]; ok {
			existing.Name = name
			existing.ContactEmail = contactEmail
			existing.LogoURL = logoURL
			existing.Status = status
			existing.UpdatedAt = time.Now()
			return existing, nil
		}

		org := &model.Organization{
			ID:           uuid.New(),
			Slug:         slug,
			Name:         name,
			ContactEmail: contactEmail,
			LogoURL:      logoURL,
			Status:       status,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		r.memOrgs[slug] = org
		return org, nil
	}

	query := `
		INSERT INTO organizations (slug, name, contact_email, logo_url, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, now(), now())
		ON CONFLICT (slug) DO UPDATE SET 
			name = EXCLUDED.name, 
			contact_email = EXCLUDED.contact_email,
			logo_url = EXCLUDED.logo_url, 
			status = EXCLUDED.status,
			updated_at = now()
		RETURNING id, slug, name, COALESCE(contact_email, ''), COALESCE(logo_url, ''), status, created_at, updated_at
	`
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, slug, name, contactEmail, logoURL, string(status)).Scan(
		&o.ID, &o.Slug, &o.Name, &o.ContactEmail, &o.LogoURL, &o.Status, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("org_repo: register: %w", err)
	}
	return &o, nil
}

func (r *OrgRepository) List(ctx context.Context, status string) ([]model.Organization, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var orgs []model.Organization
		for _, org := range r.memOrgs {
			if status == "" || string(org.Status) == status {
				orgs = append(orgs, *org)
			}
		}
		return orgs, nil
	}

	query := `
		SELECT id, slug, name, COALESCE(contact_email, ''), COALESCE(logo_url, ''), status, created_at, updated_at
		FROM organizations
		WHERE ($1 = '' OR status = $1)
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, status)
	if err != nil {
		return nil, fmt.Errorf("org_repo: list: %w", err)
	}
	defer rows.Close()

	var orgs []model.Organization
	for rows.Next() {
		var o model.Organization
		if err := rows.Scan(&o.ID, &o.Slug, &o.Name, &o.ContactEmail, &o.LogoURL, &o.Status, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("org_repo: scan: %w", err)
		}
		orgs = append(orgs, o)
	}
	return orgs, nil
}

func (r *OrgRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status model.OrgStatus) (*model.Organization, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, org := range r.memOrgs {
			if org.ID == id {
				org.Status = status
				org.UpdatedAt = time.Now()
				return org, nil
			}
		}
		return nil, ErrOrgNotFound
	}

	query := `
		UPDATE organizations
		SET status = $1, updated_at = now()
		WHERE id = $2
		RETURNING id, slug, name, COALESCE(contact_email, ''), COALESCE(logo_url, ''), status, created_at, updated_at
	`
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, string(status), id).Scan(
		&o.ID, &o.Slug, &o.Name, &o.ContactEmail, &o.LogoURL, &o.Status, &o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOrgNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("org_repo: update status: %w", err)
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
		SELECT id, slug, name, COALESCE(contact_email, ''), COALESCE(logo_url, ''), status, created_at, updated_at
		FROM organizations
		WHERE slug = $1
	`
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, slug).Scan(
		&o.ID, &o.Slug, &o.Name, &o.ContactEmail, &o.LogoURL, &o.Status, &o.CreatedAt, &o.UpdatedAt,
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
		SELECT id, slug, name, COALESCE(contact_email, ''), COALESCE(logo_url, ''), status, created_at, updated_at
		FROM organizations
		WHERE id = $1
	`
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&o.ID, &o.Slug, &o.Name, &o.ContactEmail, &o.LogoURL, &o.Status, &o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOrgNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("org_repo: get by id: %w", err)
	}
	return &o, nil
}
