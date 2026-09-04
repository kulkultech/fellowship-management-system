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
	// Pre-seed LIT 2026 program with exact Workflow.pdf configuration
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
		AIInterviewInstructions:  "Assess communication readiness, workplace problem-solving, and collaboration per LIT rubric.",
		AIInterviewRubric:        model.DefaultLITRubric(),
		AIInterviewQuestions: []string{
			"Please introduce yourself briefly. What sparked your interest in joining this program, and what do you hope to achieve during the fellowship?",
			"Tell us about a time when you had to learn something difficult or unfamiliar, whether in your studies, a project, or personal development. How did you approach it, and what was the outcome?",
			"Imagine you are assigned a task by your supervisor or mentor, but the instructions are unclear, or you realize you do not fully understand the requirements. What would you do, and how would you communicate with your supervisor?",
			"Describe a situation where you had to work with others and encountered a miscommunication or disagreement. How did you address it, and what did you learn?",
			"Suppose you are working on a project deadline for the fellowship, and you realize you might not be able to finish on time. How would you handle this situation, and what would you say to your team or mentor?",
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
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	if p.OpenDate.IsZero() {
		p.OpenDate = time.Now()
	}
	if p.EndDate.IsZero() {
		p.EndDate = time.Now().Add(180 * 24 * time.Hour)
	}
	if p.Status == "" {
		p.Status = "published"
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
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
	rubricJSON, _ := json.Marshal(p.AIInterviewRubric)
	if p.AIInterviewRubric == nil {
		rubricJSON = []byte("null")
	}

	query := `
		INSERT INTO programs (
			organization_id, slug, name, description, image_url, open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, ai_interview_instructions, ai_interview_questions, application_stages,
			ai_interview_rubric, status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
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
			ai_interview_rubric = EXCLUDED.ai_interview_rubric,
			status = EXCLUDED.status,
			updated_at = now()
		RETURNING id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			status, created_at, updated_at
	`
	var res model.Program
	var rawQuestions []byte
	var rawStages []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query,
		p.OrganizationID, p.Slug, p.Name, p.Description, p.ImageURL, p.OpenDate, p.EndDate,
		p.EnableMCQ, p.LogicTestDurationMinutes, p.LogicTestPassingScore, p.AllowRetake,
		p.EnableAIInterview, p.AIInterviewInstructions, questionsJSON, stagesJSON,
		rubricJSON, p.Status,
	).Scan(
		&res.ID, &res.OrganizationID, &res.Slug, &res.Name, &res.Description, &res.ImageURL,
		&res.OpenDate, &res.EndDate,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore, &res.AllowRetake,
		&res.EnableAIInterview, &res.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&res.Status, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("program_repo: create: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &res.ApplicationStages)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &res.AIInterviewRubric)
	}
	if res.AIInterviewRubric == nil && res.Slug == "lit2026" {
		res.AIInterviewRubric = model.DefaultLITRubric()
	}
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
		if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
			p.AIInterviewRubric = model.DefaultLITRubric()
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
			COALESCE(p.application_stages, '[]'::jsonb), COALESCE(p.ai_interview_rubric, 'null'::jsonb),
			p.status, p.created_at, p.updated_at,
			o.id, o.slug, o.name, COALESCE(o.logo_url, ''), o.status, o.created_at, o.updated_at
		FROM programs p
		JOIN organizations o ON p.organization_id = o.id
		WHERE o.slug = $1 AND p.slug = $2
	`
	var p model.Program
	var o model.Organization
	var rawQuestions []byte
	var rawStages []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, orgSlug, programSlug).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
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
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}
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
				if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
					p.AIInterviewRubric = model.DefaultLITRubric()
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
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			status, created_at, updated_at
		FROM programs
		WHERE id = $1
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: get by id: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}
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
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			status, created_at, updated_at
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, id, duration, passingScore, allowRetake).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update config: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
	}
	return &p, nil
}

func (r *ProgramRepository) UpdatePipeline(ctx context.Context, id uuid.UUID, enableMCQ, enableAI bool, instructions string, questions []string) (*model.Program, error) {
	return r.UpdatePipelineWithRubric(ctx, id, enableMCQ, enableAI, instructions, questions, nil)
}

func (r *ProgramRepository) UpdatePipelineWithRubric(ctx context.Context, id uuid.UUID, enableMCQ, enableAI bool, instructions string, questions []string, rubric *model.AIInterviewRubric) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.EnableMCQ = enableMCQ
				p.EnableAIInterview = enableAI
				p.AIInterviewInstructions = instructions
				p.AIInterviewQuestions = questions
				if rubric != nil {
					p.AIInterviewRubric = rubric
				}
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

	var query string
	var args []any

	if rubric != nil {
		rubricJSON, _ := json.Marshal(rubric)
		query = `
			UPDATE programs
			SET enable_mcq = $2,
				enable_ai_interview = $3,
				ai_interview_instructions = $4,
				ai_interview_questions = $5,
				ai_interview_rubric = $6,
				updated_at = now()
			WHERE id = $1
			RETURNING id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
				enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
				enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
				COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
				status, created_at, updated_at
		`
		args = []any{id, enableMCQ, enableAI, instructions, questionsJSON, rubricJSON}
	} else {
		query = `
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
				COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
				status, created_at, updated_at
		`
		args = []any{id, enableMCQ, enableAI, instructions, questionsJSON}
	}

	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update pipeline: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
	}
	return &p, nil
}

func (r *ProgramRepository) UpdateRubric(ctx context.Context, id uuid.UUID, rubric *model.AIInterviewRubric) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.AIInterviewRubric = rubric
				if rubric != nil && len(rubric.Questions) > 0 {
					qTexts := make([]string, len(rubric.Questions))
					for i, q := range rubric.Questions {
						qTexts[i] = q.Question
					}
					p.AIInterviewQuestions = qTexts
				}
				p.UpdatedAt = time.Now()
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	rubricJSON, _ := json.Marshal(rubric)

	// Also extract question texts to keep legacy column in sync
	var questionTexts []string
	if rubric != nil {
		for _, q := range rubric.Questions {
			questionTexts = append(questionTexts, q.Question)
		}
	}
	qJSON, _ := json.Marshal(questionTexts)

	query := `
		UPDATE programs
		SET ai_interview_rubric = $2,
			ai_interview_questions = CASE WHEN $3::text = '[]' THEN ai_interview_questions ELSE $3::jsonb END,
			updated_at = now()
		WHERE id = $1
		RETURNING id, organization_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			status, created_at, updated_at
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, id, rubricJSON, string(qJSON)).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update rubric: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}
	return &p, nil
}

func (r *ProgramRepository) UpdateStages(ctx context.Context, id uuid.UUID, stages []model.ApplicationStageItem) (*model.Program, error) {
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
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			status, created_at, updated_at
	`
	var p model.Program
	var rawQuestions []byte
	var rawStages []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, id, stagesJSON).Scan(
		&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update stages: %w", err)
	}
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}
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
				if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
					p.AIInterviewRubric = model.DefaultLITRubric()
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
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			status, created_at, updated_at
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
		var rawRubric []byte
		if err := rows.Scan(
			&p.ID, &p.OrganizationID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
			&p.OpenDate, &p.EndDate,
			&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
			&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
			&p.Status, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("program_repo: scan: %w", err)
		}
		_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
		_ = json.Unmarshal(rawStages, &p.ApplicationStages)
		if len(rawRubric) > 0 && string(rawRubric) != "null" {
			_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
		}
		if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
			p.AIInterviewRubric = model.DefaultLITRubric()
		}
		if len(p.ApplicationStages) == 0 {
			p.ApplicationStages = DefaultApplicationStages()
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (r *ProgramRepository) Delete(ctx context.Context, id uuid.UUID, orgID uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for key, p := range r.memPrograms {
			if p.ID == id {
				delete(r.memPrograms, key)
				return nil
			}
		}
		return ErrProgramNotFound
	}

	// For superadmin or fallback org, allow deleting if id matches
	query := `DELETE FROM programs WHERE id = $1 AND (organization_id = $2 OR organization_id = '00000000-0000-0000-0000-000000000001'::uuid)`
	tag, err := r.pool.Exec(ctx, query, id, orgID)
	if err != nil {
		return fmt.Errorf("program_repo: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrProgramNotFound
	}
	return nil
}
