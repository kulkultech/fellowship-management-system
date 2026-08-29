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

var ErrProgramNotFound = errors.New("program not found")

type ProgramRepository struct {
	pool        *pgxpool.Pool
	mu          sync.RWMutex
	memPrograms map[string]*model.Program
}

func NewProgramRepository(pool *pgxpool.Pool) *ProgramRepository {
	repo := &ProgramRepository{
		pool:        pool,
		memPrograms: make(map[string]*model.Program),
	}
	// Pre-seed LIT 2026 program
	litProg := &model.Program{
		ID:                       uuid.MustParse("00000000-0000-0000-0000-000000000003"),
		OrganizationID:           uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Slug:                     "lit2026",
		Name:                     "LIT 2026 Fellowship & Assessment",
		Description:              "The flagship talent acceleration fellowship program by Remote Skills Academy (RSA) and Kulkul Tech. Assessment tests include Timed Logic & Architecture MCQ followed by an interactive AI Technical Screening Room.",
		ImageURL:                 "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80",
		OpenDate:                 time.Now().Add(-24 * time.Hour),
		EndDate:                  time.Now().Add(180 * 24 * time.Hour),
		LogicTestDurationMinutes: 30,
		LogicTestPassingScore:    70,
		AllowRetake:              false,
		Status:                   "published",
		CreatedAt:                time.Now(),
		UpdatedAt:                time.Now(),
	}
	repo.memPrograms["rsa:lit2026"] = litProg
	return repo
}

func (r *ProgramRepository) Create(ctx context.Context, p *model.Program) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if p.ID == uuid.Nil {
			p.ID = uuid.New()
		}
		if p.OpenDate.IsZero() {
			p.OpenDate = time.Now()
		}
		if p.EndDate.IsZero() {
			p.EndDate = time.Now().Add(180 * 24 * time.Hour)
		}
		p.CreatedAt = time.Now()
		p.UpdatedAt = time.Now()
		key := fmt.Sprintf("%s:%s", p.OrganizationID, p.Slug)
		r.memPrograms[key] = p
		// Also index by slug
		r.memPrograms[p.Slug] = p
		return p, nil
	}

	query := `
		INSERT INTO programs (
			organization_id, slug, name, description, image_url, open_date, end_date,
			logic_test_duration_minutes, logic_test_passing_score, allow_retake, status,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
		ON CONFLICT (organization_id, slug) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			image_url = EXCLUDED.image_url,
			open_date = EXCLUDED.open_date,
			end_date = EXCLUDED.end_date,
			logic_test_duration_minutes = EXCLUDED.logic_test_duration_minutes,
			logic_test_passing_score = EXCLUDED.logic_test_passing_score,
			allow_retake = EXCLUDED.allow_retake,
			status = EXCLUDED.status,
			updated_at = now()
		RETURNING id, organization_id, slug, name, description, image_url, open_date, end_date,
			logic_test_duration_minutes, logic_test_passing_score, allow_retake, status,
			created_at, updated_at
	`
	var res model.Program
	err := r.pool.QueryRow(ctx, query,
		p.OrganizationID, p.Slug, p.Name, p.Description, p.ImageURL, p.OpenDate, p.EndDate,
		p.LogicTestDurationMinutes, p.LogicTestPassingScore, p.AllowRetake, p.Status,
	).Scan(
		&res.ID, &res.OrganizationID, &res.Slug, &res.Name, &res.Description, &res.ImageURL,
		&res.OpenDate, &res.EndDate, &res.LogicTestDurationMinutes,
		&res.LogicTestPassingScore, &res.AllowRetake, &res.Status,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("program_repo: create: %w", err)
	}
	return &res, nil
}

func (r *ProgramRepository) GetByOrgSlugAndProgramSlug(ctx context.Context, orgSlug, programSlug string) (*model.Program, *model.Organization, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		key := fmt.Sprintf("%s:%s", orgSlug, programSlug)
		p, ok := r.memPrograms[key]
		if !ok {
			// Try finding by program slug alone
			for _, prog := range r.memPrograms {
				if prog.Slug == programSlug {
					p = prog
					ok = true
					break
				}
			}
		}
		if !ok {
			return nil, nil, ErrProgramNotFound
		}
		org := &model.Organization{
			ID:        p.OrganizationID,
			Slug:      orgSlug,
			Name:      "Remote Skills Academy (RSA)",
			LogoURL:   "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=128&h=128&fit=crop",
			CreatedAt: p.CreatedAt,
			UpdatedAt: p.UpdatedAt,
		}
		return p, org, nil
	}

	query := `
		SELECT 
			p.id, p.organization_id, p.slug, p.name, p.description, COALESCE(p.image_url, ''), p.open_date, p.end_date,
			p.logic_test_duration_minutes, p.logic_test_passing_score, p.allow_retake, p.status,
			p.created_at, p.updated_at,
			o.id, o.slug, o.name, o.logo_url, o.created_at, o.updated_at
		FROM programs p
		JOIN organizations o ON p.organization_id = o.id
		WHERE o.slug = $1 AND p.slug = $2
	`
	var p model.Program
	var o model.Organization
	err := r.pool.QueryRow(ctx, query, orgSlug, programSlug).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate, &p.LogicTestDurationMinutes,
		&p.LogicTestPassingScore, &p.AllowRetake, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
		&o.ID, &o.Slug, &o.Name, &o.LogoURL, &o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("program_repo: get by slugs: %w", err)
	}
	return &p, &o, nil
}

func (r *ProgramRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Program, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	query := `
		SELECT id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			logic_test_duration_minutes, logic_test_passing_score, allow_retake, status,
			created_at, updated_at
		FROM programs
		WHERE id = $1
	`
	var p model.Program
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate, &p.LogicTestDurationMinutes,
		&p.LogicTestPassingScore, &p.AllowRetake, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: get by id: %w", err)
	}
	return &p, nil
}

func (r *ProgramRepository) UpdateConfig(ctx context.Context, id uuid.UUID, duration, passingScore int, allowRetake bool) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.LogicTestDurationMinutes = duration
				p.LogicTestPassingScore = passingScore
				p.AllowRetake = allowRetake
				p.UpdatedAt = time.Now()
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	query := `
		UPDATE programs
		SET logic_test_duration_minutes = $2,
			logic_test_passing_score = $3,
			allow_retake = $4,
			updated_at = now()
		WHERE id = $1
		RETURNING id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			logic_test_duration_minutes, logic_test_passing_score, allow_retake, status,
			created_at, updated_at
	`
	var p model.Program
	err := r.pool.QueryRow(ctx, query, id, duration, passingScore, allowRetake).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate, &p.LogicTestDurationMinutes,
		&p.LogicTestPassingScore, &p.AllowRetake, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update config: %w", err)
	}
	return &p, nil
}

func (r *ProgramRepository) ListByOrg(ctx context.Context, orgID uuid.UUID) ([]model.Program, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.Program
		seen := make(map[string]bool)
		for _, p := range r.memPrograms {
			if !seen[p.Slug] {
				seen[p.Slug] = true
				list = append(list, *p)
			}
		}
		return list, nil
	}

	query := `
		SELECT id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			logic_test_duration_minutes, logic_test_passing_score, allow_retake, status,
			created_at, updated_at
		FROM programs
		WHERE organization_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("program_repo: list by org: %w", err)
	}
	defer rows.Close()

	var list []model.Program
	for rows.Next() {
		var p model.Program
		if err := rows.Scan(
			&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
			&p.OpenDate, &p.EndDate, &p.LogicTestDurationMinutes,
			&p.LogicTestPassingScore, &p.AllowRetake, &p.Status,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("program_repo: scan: %w", err)
		}
		list = append(list, p)
	}
	return list, rows.Err()
}
