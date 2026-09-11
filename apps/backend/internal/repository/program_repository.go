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

func BuildApplicationStages(enableMCQ, enableAI bool, hasTracks bool) []model.ApplicationStageItem {
	var stages []model.ApplicationStageItem
	step := 1

	trackTitle := "Candidate Intake Application"
	trackDesc := "Submit your academic background, IT major, and contact details."
	if hasTracks {
		trackTitle = "Specialization Track & Intake Application"
		trackDesc = "Choose your target specialization track and submit your academic background, IT major, and contact details."
	}
	stages = append(stages, model.ApplicationStageItem{
		StepNumber:  step,
		Title:       trackTitle,
		Description: trackDesc,
	})
	step++

	if enableMCQ {
		mcqTitle := "Timed Logic & Technical Assessment"
		mcqDesc := "Solve timed logic and technical domain MCQs calibrated for candidate benchmarking."
		if hasTracks {
			mcqTitle = "Track-Specific Timed Logic Assessment"
			mcqDesc = "Solve timed logic and technical domain MCQs calibrated for your chosen specialization track."
		}
		stages = append(stages, model.ApplicationStageItem{
			StepNumber:  step,
			Title:       mcqTitle,
			Description: mcqDesc,
		})
		step++
	}

	if enableAI {
		stages = append(stages, model.ApplicationStageItem{
			StepNumber:  step,
			Title:       "Conversational AI Technical Screen",
			Description: "Engage in an interactive conversational AI screening session evaluating technical depth and problem-solving.",
		})
		step++
	}

	stages = append(stages, model.ApplicationStageItem{
		StepNumber:  step,
		Title:       "Submission & Application Confirmation",
		Description: "Candidate completes assessment submission and receives an official application confirmation update.",
	})
	step++

	stages = append(stages, model.ApplicationStageItem{
		StepNumber:  step,
		Title:       "Admissions Committee Review & Scoring",
		Description: "The reviewer committee evaluates assessment scores, candidate qualifications, and screening responses.",
	})
	step++

	stages = append(stages, model.ApplicationStageItem{
		StepNumber:  step,
		Title:       "Approval & Final Interview Scheduling",
		Description: "Approved candidates receive an official invitation and link to schedule their final interview with the host organization.",
	})

	return stages
}

func DefaultApplicationStages() []model.ApplicationStageItem {
	return BuildApplicationStages(true, true, true)
}

func NewProgramRepository(pool *pgxpool.Pool) *ProgramRepository {
	repo := &ProgramRepository{
		pool:        pool,
		memPrograms: make(map[string]*model.Program),
	}
	// Pre-seed LIT 2026 program with exact Workflow.pdf configuration
	return repo
}

func unmarshalAndDefaultProgram(p *model.Program, rawQuestions, rawStages, rawRubric, rawSchema []byte) {
	_ = json.Unmarshal(rawQuestions, &p.AIInterviewQuestions)
	_ = json.Unmarshal(rawStages, &p.ApplicationStages)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &p.AIInterviewRubric)
	}
	if p.AIInterviewRubric == nil && p.Slug == "lit2026" {
		p.AIInterviewRubric = model.DefaultLITRubric()
	}
	if p.PreviewToken == uuid.Nil {
		p.PreviewToken = uuid.New()
	}
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = DefaultApplicationStages()
	}
	if len(rawSchema) > 0 && string(rawSchema) != "null" {
		_ = json.Unmarshal(rawSchema, &p.ApplicationFormSchema)
	}
	if p.ApplicationFormSchema == nil {
		if p.Slug == "lit2026" {
			p.ApplicationFormSchema = model.DefaultRSAFormSchema()
		} else {
			p.ApplicationFormSchema = model.DefaultCompanyFormSchema()
		}
	}
}

func (r *ProgramRepository) populateQuestionSetInfo(ctx context.Context, p *model.Program) {
	if r.pool == nil || p == nil || p.QuestionSetID == nil {
		return
	}
	_ = r.pool.QueryRow(ctx, `
		SELECT COALESCE(qs.name, ''), (SELECT COUNT(*) FROM mcq_questions mq WHERE mq.question_set_id = qs.id)
		FROM question_sets qs WHERE qs.id = $1
	`, *p.QuestionSetID).Scan(&p.QuestionSetName, &p.QuestionCount)
}

func (r *ProgramRepository) Create(ctx context.Context, p *model.Program) (*model.Program, error) {
	if len(p.ApplicationStages) == 0 {
		p.ApplicationStages = BuildApplicationStages(p.EnableMCQ, p.EnableAIInterview, false)
	}
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	if p.PreviewToken == uuid.Nil {
		p.PreviewToken = uuid.New()
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
	if p.ApplicationFormSchema == nil {
		if p.Slug == "lit2026" {
			p.ApplicationFormSchema = model.DefaultRSAFormSchema()
		} else {
			p.ApplicationFormSchema = model.DefaultCompanyFormSchema()
		}
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
	schemaJSON, _ := json.Marshal(p.ApplicationFormSchema)
	if p.ApplicationFormSchema == nil {
		schemaJSON = []byte("null")
	}

	query := `
		INSERT INTO programs (
			organization_id, question_set_id, slug, name, description, image_url, open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, ai_interview_instructions, ai_interview_questions, application_stages,
			ai_interview_rubric, application_form_schema, status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), now())
		ON CONFLICT (organization_id, slug) DO UPDATE SET
			question_set_id = EXCLUDED.question_set_id,
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
			application_form_schema = COALESCE(EXCLUDED.application_form_schema, programs.application_form_schema),
			status = EXCLUDED.status,
			updated_at = now()
		RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			COALESCE(application_form_schema, 'null'::jsonb),
			status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
	`
	var res model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query,
		p.OrganizationID, p.QuestionSetID, p.Slug, p.Name, p.Description, p.ImageURL, p.OpenDate, p.EndDate,
		p.EnableMCQ, p.LogicTestDurationMinutes, p.LogicTestPassingScore, p.AllowRetake,
		p.EnableAIInterview, p.AIInterviewInstructions, questionsJSON, stagesJSON,
		rubricJSON, schemaJSON, p.Status,
	).Scan(
		&res.ID, &res.OrganizationID, &res.QuestionSetID, &res.Slug, &res.Name, &res.Description, &res.ImageURL,
		&res.OpenDate, &res.EndDate,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore, &res.AllowRetake,
		&res.EnableAIInterview, &res.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&res.Status, &res.PreviewToken, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("program_repo: create: %w", err)
	}
	unmarshalAndDefaultProgram(&res, rawQuestions, rawStages, rawRubric, rawSchema)
	r.populateQuestionSetInfo(ctx, &res)
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
		if p.ApplicationFormSchema == nil {
			if p.Slug == "lit2026" {
				p.ApplicationFormSchema = model.DefaultRSAFormSchema()
			} else {
				p.ApplicationFormSchema = model.DefaultCompanyFormSchema()
			}
		}
		org := &model.Organization{
			ID:        p.OrganizationID,
			Slug:      orgSlug,
			Name:      "Acme Academy",
			LogoURL:   "",
			Status:    model.OrgStatusApproved,
			CreatedAt: p.CreatedAt,
			UpdatedAt: p.UpdatedAt,
		}
		return p, org, nil
	}

	query := `
		SELECT 
			p.id, p.organization_id, p.question_set_id, p.slug, p.name, p.description, COALESCE(p.image_url, ''), p.open_date, p.end_date,
			p.enable_mcq, p.logic_test_duration_minutes, p.logic_test_passing_score, p.allow_retake,
			p.enable_ai_interview, COALESCE(p.ai_interview_instructions, ''), p.ai_interview_questions,
			COALESCE(p.application_stages, '[]'::jsonb), COALESCE(p.ai_interview_rubric, 'null'::jsonb),
			COALESCE(p.application_form_schema, 'null'::jsonb),
			p.status, COALESCE(p.preview_token, gen_random_uuid()), p.created_at, p.updated_at,
			COALESCE(qs.name, '') as question_set_name,
			(SELECT COUNT(*) FROM mcq_questions mq WHERE mq.question_set_id = p.question_set_id) as question_count,
			o.id, o.slug, o.name, COALESCE(o.logo_url, ''), o.status, o.created_at, o.updated_at
		FROM programs p
		JOIN organizations o ON p.organization_id = o.id
		LEFT JOIN question_sets qs ON qs.id = p.question_set_id
		WHERE o.slug = $1 AND p.slug = $2
	`
	var p model.Program
	var o model.Organization
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, orgSlug, programSlug).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
		&p.QuestionSetName, &p.QuestionCount,
		&o.ID, &o.Slug, &o.Name, &o.LogoURL, &o.Status, &o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("program_repo: get by slugs: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
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
				if p.ApplicationFormSchema == nil {
					if p.Slug == "lit2026" {
						p.ApplicationFormSchema = model.DefaultRSAFormSchema()
					} else {
						p.ApplicationFormSchema = model.DefaultCompanyFormSchema()
					}
				}
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	query := `
		SELECT p.id, p.organization_id, p.question_set_id, p.slug, p.name, p.description, COALESCE(p.image_url, ''), p.open_date, p.end_date,
			p.enable_mcq, p.logic_test_duration_minutes, p.logic_test_passing_score, p.allow_retake,
			p.enable_ai_interview, COALESCE(p.ai_interview_instructions, ''), p.ai_interview_questions,
			COALESCE(p.application_stages, '[]'::jsonb), COALESCE(p.ai_interview_rubric, 'null'::jsonb),
			COALESCE(p.application_form_schema, 'null'::jsonb),
			p.status, COALESCE(p.preview_token, gen_random_uuid()), p.created_at, p.updated_at,
			COALESCE(qs.name, '') as question_set_name,
			(SELECT COUNT(*) FROM mcq_questions mq WHERE mq.question_set_id = p.question_set_id) as question_count
		FROM programs p
		LEFT JOIN question_sets qs ON qs.id = p.question_set_id
		WHERE p.id = $1
	`
	var p model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
		&p.QuestionSetName, &p.QuestionCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: get by id: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
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
		RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			COALESCE(application_form_schema, 'null'::jsonb),
			status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
	`
	var p model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, id, duration, passingScore, allowRetake).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update config: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
	r.populateQuestionSetInfo(ctx, &p)
	return &p, nil
}

func (r *ProgramRepository) UpdateDetails(ctx context.Context, id uuid.UUID, name, description, imageURL string, openDate, endDate *time.Time, status string) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.Name = name
				if description != "" {
					p.Description = description
				}
				if imageURL != "" {
					p.ImageURL = imageURL
				}
				if openDate != nil && !openDate.IsZero() {
					p.OpenDate = *openDate
				}
				if endDate != nil && !endDate.IsZero() {
					p.EndDate = *endDate
				}
				if status != "" {
					p.Status = status
				}
				p.UpdatedAt = time.Now()
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	query := `
		UPDATE programs
		SET name = $2,
			description = $3,
			image_url = CASE WHEN $4::text = '' THEN image_url ELSE $4::text END,
			open_date = COALESCE($5, open_date),
			end_date = COALESCE($6, end_date),
			status = CASE WHEN $7::text = '' THEN status ELSE $7::text END,
			updated_at = now()
		WHERE id = $1
		RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			COALESCE(application_form_schema, 'null'::jsonb),
			status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
	`
	var p model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, id, name, description, imageURL, openDate, endDate, status).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update details: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
	r.populateQuestionSetInfo(ctx, &p)
	return &p, nil
}

func (r *ProgramRepository) UpdatePipeline(ctx context.Context, id uuid.UUID, questionSetID *uuid.UUID, enableMCQ, enableAI bool, instructions string, questions []string) (*model.Program, error) {
	return r.UpdatePipelineWithRubric(ctx, id, questionSetID, enableMCQ, enableAI, instructions, questions, nil)
}

func (r *ProgramRepository) UpdatePipelineWithRubric(ctx context.Context, id uuid.UUID, questionSetID *uuid.UUID, enableMCQ, enableAI bool, instructions string, questions []string, rubric *model.AIInterviewRubric) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.QuestionSetID = questionSetID
				p.EnableMCQ = enableMCQ
				p.EnableAIInterview = enableAI
				p.AIInterviewInstructions = instructions
				p.AIInterviewQuestions = questions
				if rubric != nil {
					p.AIInterviewRubric = rubric
				}
				p.ApplicationStages = BuildApplicationStages(enableMCQ, enableAI, false)
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

	var trackCount int
	_ = r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM program_tracks WHERE program_id = $1`, id).Scan(&trackCount)
	stages := BuildApplicationStages(enableMCQ, enableAI, trackCount > 0)
	stagesJSON, _ := json.Marshal(stages)

	var query string
	var args []any

	if rubric != nil {
		rubricJSON, _ := json.Marshal(rubric)
		query = `
			UPDATE programs
			SET question_set_id = $2,
				enable_mcq = $3,
				enable_ai_interview = $4,
				ai_interview_instructions = $5,
				ai_interview_questions = $6,
				ai_interview_rubric = $7,
				application_stages = $8,
				updated_at = now()
			WHERE id = $1
			RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
				enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
				enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
				COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
				COALESCE(application_form_schema, 'null'::jsonb),
				status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
		`
		args = []any{id, questionSetID, enableMCQ, enableAI, instructions, questionsJSON, rubricJSON, stagesJSON}
	} else {
		query = `
			UPDATE programs
			SET question_set_id = $2,
				enable_mcq = $3,
				enable_ai_interview = $4,
				ai_interview_instructions = $5,
				ai_interview_questions = $6,
				application_stages = $7,
				updated_at = now()
			WHERE id = $1
			RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
				enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
				enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
				COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
				COALESCE(application_form_schema, 'null'::jsonb),
				status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
		`
		args = []any{id, questionSetID, enableMCQ, enableAI, instructions, questionsJSON, stagesJSON}
	}

	var p model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update pipeline: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
	r.populateQuestionSetInfo(ctx, &p)
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
		RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			COALESCE(application_form_schema, 'null'::jsonb),
			status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
	`
	var p model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, id, rubricJSON, string(qJSON)).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update rubric: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
	r.populateQuestionSetInfo(ctx, &p)
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
		RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			COALESCE(application_form_schema, 'null'::jsonb),
			status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
	`
	var p model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, id, stagesJSON).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update stages: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
	r.populateQuestionSetInfo(ctx, &p)
	return &p, nil
}

func (r *ProgramRepository) UpdateFormSchema(ctx context.Context, id uuid.UUID, schema *model.ApplicationFormSchema) (*model.Program, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, p := range r.memPrograms {
			if p.ID == id {
				p.ApplicationFormSchema = schema
				p.UpdatedAt = time.Now()
				return p, nil
			}
		}
		return nil, ErrProgramNotFound
	}

	schemaJSON, _ := json.Marshal(schema)
	if schema == nil {
		schemaJSON = []byte("null")
	}

	query := `
		UPDATE programs
		SET application_form_schema = $2,
			updated_at = now()
		WHERE id = $1
		RETURNING id, organization_id, question_set_id, slug, name, description, COALESCE(image_url, ''), open_date, end_date,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score, allow_retake,
			enable_ai_interview, COALESCE(ai_interview_instructions, ''), ai_interview_questions,
			COALESCE(application_stages, '[]'::jsonb), COALESCE(ai_interview_rubric, 'null'::jsonb),
			COALESCE(application_form_schema, 'null'::jsonb),
			status, COALESCE(preview_token, gen_random_uuid()), created_at, updated_at
	`
	var p model.Program
	var rawQuestions, rawStages, rawRubric, rawSchema []byte
	err := r.pool.QueryRow(ctx, query, id, schemaJSON).Scan(
		&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
		&p.OpenDate, &p.EndDate,
		&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
		&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
		&rawSchema,
		&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProgramNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("program_repo: update form schema: %w", err)
	}
	unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
	r.populateQuestionSetInfo(ctx, &p)
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
				if p.ApplicationFormSchema == nil {
					if p.Slug == "lit2026" {
						p.ApplicationFormSchema = model.DefaultRSAFormSchema()
					} else {
						p.ApplicationFormSchema = model.DefaultCompanyFormSchema()
					}
				}
				list = append(list, *p)
			}
		}
		return list, nil
	}

	query := `
		SELECT p.id, p.organization_id, p.question_set_id, p.slug, p.name, p.description, COALESCE(p.image_url, ''), p.open_date, p.end_date,
			p.enable_mcq, p.logic_test_duration_minutes, p.logic_test_passing_score, p.allow_retake,
			p.enable_ai_interview, COALESCE(p.ai_interview_instructions, ''), p.ai_interview_questions,
			COALESCE(p.application_stages, '[]'::jsonb), COALESCE(p.ai_interview_rubric, 'null'::jsonb),
			COALESCE(p.application_form_schema, 'null'::jsonb),
			p.status, COALESCE(p.preview_token, gen_random_uuid()), p.created_at, p.updated_at,
			COALESCE(qs.name, '') as question_set_name,
			(SELECT COUNT(*) FROM mcq_questions mq WHERE mq.question_set_id = p.question_set_id) as question_count
		FROM programs p
		LEFT JOIN question_sets qs ON qs.id = p.question_set_id
		WHERE p.organization_id = $1
		ORDER BY p.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("program_repo: list by org: %w", err)
	}
	defer rows.Close()

	var list []model.Program
	for rows.Next() {
		var p model.Program
		var rawQuestions, rawStages, rawRubric, rawSchema []byte
		if err := rows.Scan(
			&p.ID, &p.OrganizationID, &p.QuestionSetID, &p.Slug, &p.Name, &p.Description, &p.ImageURL,
			&p.OpenDate, &p.EndDate,
			&p.EnableMCQ, &p.LogicTestDurationMinutes, &p.LogicTestPassingScore, &p.AllowRetake,
			&p.EnableAIInterview, &p.AIInterviewInstructions, &rawQuestions, &rawStages, &rawRubric,
			&rawSchema,
			&p.Status, &p.PreviewToken, &p.CreatedAt, &p.UpdatedAt,
			&p.QuestionSetName, &p.QuestionCount,
		); err != nil {
			return nil, fmt.Errorf("program_repo: scan: %w", err)
		}
		unmarshalAndDefaultProgram(&p, rawQuestions, rawStages, rawRubric, rawSchema)
		list = append(list, p)
	}
	return list, rows.Err()
}

func (r *ProgramRepository) Delete(ctx context.Context, id uuid.UUID, orgID uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		found := false
		for key, p := range r.memPrograms {
			if p.ID == id {
				if orgID == uuid.Nil || p.OrganizationID == orgID || p.OrganizationID == uuid.MustParse("00000000-0000-0000-0000-000000000001") {
					delete(r.memPrograms, key)
					found = true
				}
			}
		}
		if found {
			return nil
		}
		return ErrProgramNotFound
	}

	query := `DELETE FROM programs WHERE id = $1`
	var args []any
	args = append(args, id)
	if orgID != uuid.Nil {
		query += ` AND (organization_id = $2 OR organization_id = '00000000-0000-0000-0000-000000000001'::uuid)`
		args = append(args, orgID)
	}
	tag, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("program_repo: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrProgramNotFound
	}
	return nil
}
