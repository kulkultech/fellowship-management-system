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

	"github.com/kulkul/backend/internal/model"
)

var ErrApplicantNotFound = errors.New("applicant not found")

type ApplicantRepository struct {
	pool          *pgxpool.Pool
	mu            sync.RWMutex
	memApplicants map[uuid.UUID]*model.Applicant
}

func NewApplicantRepository(pool *pgxpool.Pool) *ApplicantRepository {
	return &ApplicantRepository{
		pool:          pool,
		memApplicants: make(map[uuid.UUID]*model.Applicant),
	}
}

func (r *ApplicantRepository) CreateOrGet(ctx context.Context, a *model.Applicant) (*model.Applicant, bool, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, app := range r.memApplicants {
			if app.ProgramID == a.ProgramID && app.Email == a.Email {
				app.FullName = a.FullName
				app.FirstName = a.FirstName
				app.LastName = a.LastName
				app.DateOfBirth = a.DateOfBirth
				app.University = a.University
				app.Major = a.Major
				app.Semester = a.Semester
				app.ReferralSource = a.ReferralSource
				if a.TrackID != nil {
					app.TrackID = a.TrackID
				}
				if a.Phone != "" {
					app.Phone = a.Phone
				}
				if a.GitHubURL != "" {
					app.GitHubURL = a.GitHubURL
				}
				if a.LinkedInURL != "" {
					app.LinkedInURL = a.LinkedInURL
				}
				if a.ResumeURL != "" {
					app.ResumeURL = a.ResumeURL
				}
				app.UpdatedAt = time.Now()
				return app, false, nil
			}
		}
		if a.ID == uuid.Nil {
			a.ID = uuid.New()
		}
		a.CreatedAt = time.Now()
		a.UpdatedAt = time.Now()
		r.memApplicants[a.ID] = a
		return a, true, nil
	}

	query := `
		INSERT INTO applicants (
			organization_id, program_id, track_id, email, full_name, first_name, last_name,
			date_of_birth, phone, github_url, linkedin_url, resume_url, university, major,
			semester, referral_source, current_stage, notes, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), now())
		ON CONFLICT (program_id, email) DO UPDATE SET
			full_name = EXCLUDED.full_name,
			first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), applicants.first_name),
			last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), applicants.last_name),
			date_of_birth = COALESCE(NULLIF(EXCLUDED.date_of_birth, ''), applicants.date_of_birth),
			phone = COALESCE(NULLIF(EXCLUDED.phone, ''), applicants.phone),
			github_url = COALESCE(NULLIF(EXCLUDED.github_url, ''), applicants.github_url),
			linkedin_url = COALESCE(NULLIF(EXCLUDED.linkedin_url, ''), applicants.linkedin_url),
			resume_url = COALESCE(NULLIF(EXCLUDED.resume_url, ''), applicants.resume_url),
			university = COALESCE(NULLIF(EXCLUDED.university, ''), applicants.university),
			major = COALESCE(NULLIF(EXCLUDED.major, ''), applicants.major),
			semester = COALESCE(NULLIF(EXCLUDED.semester, ''), applicants.semester),
			referral_source = COALESCE(NULLIF(EXCLUDED.referral_source, ''), applicants.referral_source),
			track_id = COALESCE(EXCLUDED.track_id, applicants.track_id),
			updated_at = now()
		RETURNING id, organization_id, program_id, track_id, email, full_name,
			COALESCE(first_name, ''), COALESCE(last_name, ''), COALESCE(date_of_birth, ''),
			COALESCE(phone, ''), COALESCE(github_url, ''), COALESCE(linkedin_url, ''),
			COALESCE(resume_url, ''), COALESCE(university, ''), COALESCE(major, ''),
			COALESCE(semester, ''), COALESCE(referral_source, ''),
			current_stage, COALESCE(notes, ''), created_at, updated_at,
			(xmax = 0) AS is_inserted
	`
	var res model.Applicant
	var isInserted bool
	err := r.pool.QueryRow(ctx, query,
		a.OrganizationID, a.ProgramID, a.TrackID, a.Email, a.FullName, a.FirstName, a.LastName,
		a.DateOfBirth, a.Phone, a.GitHubURL, a.LinkedInURL, a.ResumeURL, a.University, a.Major,
		a.Semester, a.ReferralSource, a.CurrentStage, a.Notes,
	).Scan(
		&res.ID, &res.OrganizationID, &res.ProgramID, &res.TrackID, &res.Email, &res.FullName,
		&res.FirstName, &res.LastName, &res.DateOfBirth,
		&res.Phone, &res.GitHubURL, &res.LinkedInURL,
		&res.ResumeURL, &res.University, &res.Major,
		&res.Semester, &res.ReferralSource,
		&res.CurrentStage, &res.Notes,
		&res.CreatedAt, &res.UpdatedAt, &isInserted,
	)
	if err != nil {
		return nil, false, fmt.Errorf("applicant_repo: create or get: %w", err)
	}
	return &res, isInserted, nil
}

func (r *ApplicantRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Applicant, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		app, ok := r.memApplicants[id]
		if !ok {
			return nil, ErrApplicantNotFound
		}
		return app, nil
	}

	query := `
		SELECT id, organization_id, program_id, track_id, email, full_name,
			COALESCE(first_name, ''), COALESCE(last_name, ''), COALESCE(date_of_birth, ''),
			COALESCE(phone, ''), COALESCE(github_url, ''), COALESCE(linkedin_url, ''),
			COALESCE(resume_url, ''), COALESCE(university, ''), COALESCE(major, ''),
			COALESCE(semester, ''), COALESCE(referral_source, ''),
			current_stage, COALESCE(notes, ''), created_at, updated_at
		FROM applicants
		WHERE id = $1
	`
	var a model.Applicant
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&a.ID, &a.OrganizationID, &a.ProgramID, &a.TrackID, &a.Email, &a.FullName,
		&a.FirstName, &a.LastName, &a.DateOfBirth,
		&a.Phone, &a.GitHubURL, &a.LinkedInURL,
		&a.ResumeURL, &a.University, &a.Major,
		&a.Semester, &a.ReferralSource,
		&a.CurrentStage, &a.Notes,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrApplicantNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("applicant_repo: get by id: %w", err)
	}
	return &a, nil
}

func (r *ApplicantRepository) UpdateStage(ctx context.Context, id uuid.UUID, stage model.ApplicantStage) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		app, ok := r.memApplicants[id]
		if !ok {
			return ErrApplicantNotFound
		}
		app.CurrentStage = stage
		app.UpdatedAt = time.Now()
		return nil
	}

	query := `
		UPDATE applicants
		SET current_stage = $2, updated_at = now()
		WHERE id = $1
	`
	tag, err := r.pool.Exec(ctx, query, id, stage)
	if err != nil {
		return fmt.Errorf("applicant_repo: update stage: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrApplicantNotFound
	}
	return nil
}

func (r *ApplicantRepository) ListByProgram(ctx context.Context, programID uuid.UUID, stageFilter string) ([]model.Applicant, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.Applicant
		for _, app := range r.memApplicants {
			if app.ProgramID == programID {
				if stageFilter == "" || string(app.CurrentStage) == stageFilter {
					list = append(list, *app)
				}
			}
		}
		return list, nil
	}

	query := `
		SELECT id, organization_id, program_id, track_id, email, full_name,
			COALESCE(first_name, ''), COALESCE(last_name, ''), COALESCE(date_of_birth, ''),
			COALESCE(phone, ''), COALESCE(github_url, ''), COALESCE(linkedin_url, ''),
			COALESCE(resume_url, ''), COALESCE(university, ''), COALESCE(major, ''),
			COALESCE(semester, ''), COALESCE(referral_source, ''),
			current_stage, COALESCE(notes, ''), created_at, updated_at
		FROM applicants
		WHERE program_id = $1 AND ($2 = '' OR current_stage = $2)
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, programID, stageFilter)
	if err != nil {
		return nil, fmt.Errorf("applicant_repo: list by program: %w", err)
	}
	defer rows.Close()

	var list []model.Applicant
	for rows.Next() {
		var a model.Applicant
		if err := rows.Scan(
			&a.ID, &a.OrganizationID, &a.ProgramID, &a.TrackID, &a.Email, &a.FullName,
			&a.FirstName, &a.LastName, &a.DateOfBirth,
			&a.Phone, &a.GitHubURL, &a.LinkedInURL,
			&a.ResumeURL, &a.University, &a.Major,
			&a.Semester, &a.ReferralSource,
			&a.CurrentStage, &a.Notes,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("applicant_repo: scan: %w", err)
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

func (r *ApplicantRepository) ListByEmail(ctx context.Context, email string) ([]model.Applicant, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.Applicant
		for _, app := range r.memApplicants {
			if strings.ToLower(app.Email) == email {
				list = append(list, *app)
			}
		}
		return list, nil
	}

	query := `
		SELECT id, organization_id, program_id, track_id, email, full_name,
			COALESCE(first_name, ''), COALESCE(last_name, ''), COALESCE(date_of_birth, ''),
			COALESCE(phone, ''), COALESCE(github_url, ''), COALESCE(linkedin_url, ''),
			COALESCE(resume_url, ''), COALESCE(university, ''), COALESCE(major, ''),
			COALESCE(semester, ''), COALESCE(referral_source, ''),
			current_stage, COALESCE(notes, ''), created_at, updated_at
		FROM applicants
		WHERE LOWER(email) = $1
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, email)
	if err != nil {
		return nil, fmt.Errorf("applicant_repo: list by email: %w", err)
	}
	defer rows.Close()

	var list []model.Applicant
	for rows.Next() {
		var a model.Applicant
		if err := rows.Scan(
			&a.ID, &a.OrganizationID, &a.ProgramID, &a.TrackID, &a.Email, &a.FullName,
			&a.FirstName, &a.LastName, &a.DateOfBirth,
			&a.Phone, &a.GitHubURL, &a.LinkedInURL,
			&a.ResumeURL, &a.University, &a.Major,
			&a.Semester, &a.ReferralSource,
			&a.CurrentStage, &a.Notes,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("applicant_repo: scan by email: %w", err)
		}
		list = append(list, a)
	}
	return list, rows.Err()
}
