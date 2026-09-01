package repository

import (
	"context"
	"encoding/json"
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

func DefaultApplicationStages() []model.ApplicationStageItem {
	return []model.ApplicationStageItem{
		{
			StepNumber:  1,
			Title:       "Specialization Track & Intake Application",
			Description: "Choose your target specialization track and submit your academic background, IT major, and contact details.",
		},
		{
			StepNumber:  2,
			Title:       "Track-Specific Timed Logic Assessment",
			Description: "Solve timed logic and technical domain MCQs calibrated for your chosen specialization track.",
		},
		{
			StepNumber:  3,
			Title:       "Conversational AI Technical Screen",
			Description: "Engage in an interactive conversational AI screening session evaluating technical depth and problem-solving.",
		},
		{
			StepNumber:  4,
			Title:       "Submission & Application Confirmation Email",
			Description: "Candidate completes submission and receives an official application confirmation email.",
		},
		{
			StepNumber:  5,
			Title:       "Admissions Committee Review & Scoring",
			Description: "The reviewer committee evaluates combined MCQ scores, AI transcripts, and candidate qualifications.",
		},
		{
			StepNumber:  6,
			Title:       "Approval & Final Interview Scheduling",
			Description: "Approved candidates receive an official fellowship invitation and link to schedule their final interview with the host organization.",
		},
	}
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
		EnableMCQ:                true,
		LogicTestDurationMinutes: 30,
		LogicTestPassingScore:    70,
		AllowRetake:              false,
		EnableAIInterview:        true,
		AIInterviewInstructions:  "Assess software architecture, system trade-offs, and concurrency understanding.",
		AIInterviewQuestions: []string{
			"Can you describe how you would design a scalable distributed job queue?",
			"What are the pros and cons of using optimistic vs pessimistic locking in databases?",
			"How do you handle graceful degradation when downstream APIs experience high latency?",
		},
		ApplicationStages: DefaultApplicationStages(),
		Status:            "published",
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}
	repo.memPrograms["rsa:lit2026"] = litProg
	return repo
}

func (r *ProgramRepository) Create(ctx context.Context, p *model.Program) (*model.Program, error) {
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
	}
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
		r.memPrograms[p.Slug] = p
		return p, nil
	}

	questionsJSON, _ := json.Marshal(p.AIInterviewQuestions)
	if p.AIInterviewQuestions == nil {
		questionsJSON = []byte("[]")
	}
	stagesJSON, _ := json.Marshal(p.ApplicationStages)
	if p.ApplicationStages == nil {
		stagesJSON = []byte("[]")
	}

	query := `
		INSERT INTO programs (
			organization_id, slug, name, description, image_url, open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, ai_interview_instructions, ai_interview_questions, application_stages,
			status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), now())
		ON CONFLICT (organization_id, slug) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			image_url = EXCLUDED.image_url,
			open_date = EXCLUDED.open_date,
			end_date = EXCLUDED.end_date,
			enable_mcq = EXCLUDED.enable_mcq,
			logic_test_duration_minutes = EXCLUDED.logic_test_duration_minutes,
			logic_test_passing_score = EXCLUDED.logic_test_passing_score,
			allow_retake = EXCLUDED.allow_retake,
			enable_ai_interview = EXCLUDED.enable_ai_interview,
			ai_interview_instructions = EXCLUDED.ai_interview_instructions,
			ai_interview_questions = EXCLUDED.ai_interview_questions,
			application_stages = EXCLUDED.application_stages,
			status = EXCLUDED.status,
			updated_at = now()
		RETURNING id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), status, created_at, updated_at
	`
	var res model.Program
	var rawQuestions []byte
	var rawStages []byte
	err := r.pool.QueryRow(ctx, query,
		p.OrganizationID, p.Slug, p.Name, p.Description, p.ImageURL, p.OpenDate, p.EndDate,
		p.EnableMCQ, p.LogicTestDurationMinutes, p.LogicTestPassingScore, p.AllowRetake,
		p.EnableAIInterview, p.AIInterviewInstructions, questionsJSON, stagesJSON,
		p.Status,
	).Scan(
		&res.ID, &res.OrganizationID, &res.Slug, &res.Name, &res.Description, &res.ImageURL,
		&res.OpenDate, &res.EndDate,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore, &res.AllowRetake,
		&res.EnableAIInterview, &res.AIInterviewInstructions, &rawQuestions, &rawStages, &res.Status,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("program_repo: create: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &res.ApplicationStages)
	if len(res.ApplicationStages) == 0 {
		res.ApplicationStages = DefaultApplicationStages()
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
		if len(p.ApplicationStages) == 0 {
			p.ApplicationStages = DefaultApplicationStages()
		}
		org := &model.Organization{
			ID:        p.OrganizationID,
			Slug:      orgSlug,
			Name:      "Remote Skills Academy (RSA)",
			LogoURL:   "",
			Status:    model.OrgStatusApproved,
			CreatedAt: p.CreatedAt,
			UpdatedAt: p.UpdatedAt,
		}
		return p, org, nil
	}

	query := `
		SELECT 
			p.id, p.organization_id, p.slug, p.name, p.description, COALESCE(p.image_url, ''), p.open_date, p.end_date,
			p.enable_mcq, p.logic_test_duration_minutes, p.logic_test_passing_score, p.allow_retake,
			p.enable_ai_interview, COALESCE(p.ai_interview_instructions, ''), p.ai_interview_questions,
			COALESCE(p.application_stages, '[]'::jsonb), p.status, p.created_at, p.updated_at,
			o.id, o.slug, o.name, COALESCE(o.logo_url, ''), o.status, o.created_at, o.updated_at
		FROM programs p
		JOIN organizations o ON p.organization_id = o.id
		WHERE o.slug = $1 AND p.slug = $2
	`
	var p model.Program
	var o model.Organization
	var rawQuestions []byte
	var rawStages []byte
	err := r.pool.QueryRow(ctx, query, orgSlug, programSlug).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
		&o.ID, &o.Slug, &o.Name, &o.LogoURL, &o.Status, &o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("program_repo: get by slugs: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
	}
	return &p, &o, nil
}

func (r *ProgramRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Program, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				if len(p.ApplicationStages) == 0 {
					p.ApplicationStages = DefaultApplicationStages()
				}
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	query := `
		SELECT id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), status, created_at, updated_at
		FROM programs
		WHERE id = $1
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: get by id: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
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
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), status, created_at, updated_at
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	err := r.pool.QueryRow(ctx, query, id, duration, passingScore, allowRetake).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update config: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
	}
	return &p, nil
}

func (r *ProgramRepository) UpdatePipeline(ctx context.Context, id uuid.UUID, enableMCQ, enableAI bool, instructions string, questions []string) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.EnableMCQ = enableMCQ
				p.EnableAIInterview = enableAI
				p.AIInterviewInstructions = instructions
				p.AIInterviewQuestions = questions
				p.UpdatedAt = time.Now()
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	questionsJSON, _ := json.Marshal(questions)
	if questions == nil {
		questionsJSON = []byte("[]")
	}

	query := `
		UPDATE programs
		SET enable_mcq = $2,
			enable_ai_interview = $3,
			ai_interview_instructions = $4,
			ai_interview_questions = $5,
			updated_at = now()
		WHERE id = $1
		RETURNING id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), status, created_at, updated_at
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	err := r.pool.QueryRow(ctx, query, id, enableMCQ, enableAI, instructions, questionsJSON).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update pipeline: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
	}
	return &p, nil
}

func (r *ProgramRepository) UpdateStages(ctx context.Context, id uuid.UUID, stages []model.ApplicationStageItem) (*model.Program, error) {
	if len(stages) == 0 {
		stages = DefaultApplicationStages()
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.ApplicationStages = stages
				p.UpdatedAt = time.Now()
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	stagesJSON, _ := json.Marshal(stages)

	query := `
		UPDATE programs
		SET application_stages = $2,
			updated_at = now()
		WHERE id = $1
		RETURNING id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), status, created_at, updated_at
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	err := r.pool.QueryRow(ctx, query, id, stagesJSON).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &p.Status,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update stages: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
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
				if len(p.ApplicationStages) == 0 {
					p.ApplicationStages = DefaultApplicationStages()
				}
				list = append(list, *p)
			}
		}
		return list, nil
	}

	query := `
		SELECT id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), status, created_at, updated_at
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
		var rawQuestions []byte
		var rawStages []byte
		if err := rows.Scan(
			&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
			&p.OpenDate, &p.EndDate,
			&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
			&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &p.Status,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("program_repo: scan: %w", err)
		}
		_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
		_ = json.Unmarshal(rawStages, &p.ApplicationStages)
		if len(p.ApplicationStages) == 0 {
			p.ApplicationStages = DefaultApplicationStages()
		}
		list = append(list, p)
	}
	return list, rows.Err()
}
