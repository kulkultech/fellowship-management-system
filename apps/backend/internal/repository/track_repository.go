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

var ErrTrackNotFound = errors.New("track not found")

type TrackRepository struct {
	pool      *pgxpool.Pool
	mu        sync.RWMutex
	memTracks map[uuid.UUID]*model.Track
}

func NewTrackRepository(pool *pgxpool.Pool) *TrackRepository {
	repo := &TrackRepository{
		pool:      pool,
		memTracks: make(map[uuid.UUID]*model.Track),
	}
	litProgID := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	t1ID := uuid.MustParse("00000000-0000-0000-0000-000000000011")
	t2ID := uuid.MustParse("00000000-0000-0000-0000-000000000012")
	set1ID := uuid.MustParse("00000000-0000-0000-0000-000000000021") // Fullstack
	set2ID := uuid.MustParse("00000000-0000-0000-0000-000000000022") // QA

	litRubric := model.DefaultLITRubric()

	repo.memTracks[t2ID] = &model.Track{
		ID:                       t2ID,
		ProgramID:                litProgID,
		QuestionSetID:            &set1ID,
		QuestionSetName:          "Fullstack Software Engineering Assessment",
		QuestionCount:            41,
		Slug:                     "fullstack",
		Name:                     "Fullstack Software Engineering Track",
		Description:              "Fullstack engineering assessment covering modern JS DOM, HTML/CSS, Java OOP, and REST APIs.",
		EnableMCQ:                true,
		LogicTestDurationMinutes: 35,
		LogicTestPassingScore:    70,
		AllowRetake:              false,
		EnableAIInterview:        true,
		AIInterviewRubric:        litRubric,
		AIInterviewQuestions: []string{
			"Please introduce yourself briefly. What sparked your interest in joining this program, and what do you hope to achieve during the fellowship?",
			"Tell us about a time when you had to learn something difficult or unfamiliar, whether in your studies, a project, or personal development. How did you approach it, and what was the outcome?",
			"Imagine you are assigned a task by your supervisor or mentor, but the instructions are unclear, or you realize you do not fully understand the requirements. What would you do, and how would you communicate with your supervisor?",
			"Describe a situation where you had to work with others and encountered a miscommunication or disagreement. How did you address it, and what did you learn?",
			"Suppose you are working on a project deadline for the fellowship, and you realize you might not be able to finish on time. How would you handle this situation, and what would you say to your team or mentor?",
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	repo.memTracks[t1ID] = &model.Track{
		ID:                       t1ID,
		ProgramID:                litProgID,
		QuestionSetID:            &set2ID,
		QuestionSetName:          "QA & Test Automation Screening",
		QuestionCount:            38,
		Slug:                     "qa-automation",
		Name:                     "QA & Test Automation Track",
		Description:              "Hands-on assessment covering Cypress, Postman, Systems, Regression testing, and problem solving.",
		EnableMCQ:                true,
		LogicTestDurationMinutes: 35,
		LogicTestPassingScore:    70,
		AllowRetake:              false,
		EnableAIInterview:        true,
		AIInterviewRubric:        litRubric,
		AIInterviewQuestions: []string{
			"Please introduce yourself briefly. What sparked your interest in joining this program, and what do you hope to achieve during the fellowship?",
			"Tell us about a time when you had to learn something difficult or unfamiliar, whether in your studies, a project, or personal development. How did you approach it, and what was the outcome?",
			"Imagine you are assigned a task by your supervisor or mentor, but the instructions are unclear, or you realize you do not fully understand the requirements. What would you do, and how would you communicate with your supervisor?",
			"Describe a situation where you had to work with others and encountered a miscommunication or disagreement. How did you address it, and what did you learn?",
			"Suppose you are working on a project deadline for the fellowship, and you realize you might not be able to finish on time. How would you handle this situation, and what would you say to your team or mentor?",
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	return repo
}

func (r *TrackRepository) Create(ctx context.Context, t *model.Track) (*model.Track, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if t.ID == uuid.Nil {
			t.ID = uuid.New()
		}
		t.CreatedAt = time.Now()
		t.UpdatedAt = time.Now()
		r.memTracks[t.ID] = t
		return t, nil
	}

	questionsJSON, err := json.Marshal(t.AIInterviewQuestions)
	if err != nil {
		questionsJSON = []byte("[]")
	}

	rubricJSON, _ := json.Marshal(t.AIInterviewRubric)
	if t.AIInterviewRubric == nil {
		rubricJSON = []byte("null")
	}

	query := `
		INSERT INTO program_tracks (
			program_id, question_set_id, slug, name, description,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, ai_interview_instructions,
			ai_interview_questions, ai_interview_rubric, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
		ON CONFLICT (program_id, slug) DO UPDATE SET
			question_set_id = EXCLUDED.question_set_id,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			enable_mcq = EXCLUDED.enable_mcq,
			logic_test_duration_minutes = EXCLUDED.logic_test_duration_minutes,
			logic_test_passing_score = EXCLUDED.logic_test_passing_score,
			allow_retake = EXCLUDED.allow_retake,
			enable_ai_interview = EXCLUDED.enable_ai_interview,
			ai_interview_instructions = EXCLUDED.ai_interview_instructions,
			ai_interview_questions = EXCLUDED.ai_interview_questions,
			ai_interview_rubric = EXCLUDED.ai_interview_rubric,
			updated_at = now()
		RETURNING id, program_id, question_set_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, COALESCE(ai_interview_rubric, 'null'::jsonb), created_at, updated_at
	`

	var res model.Track
	var rawQuestions []byte
	var rawRubric []byte
	err = r.pool.QueryRow(ctx, query,
		t.ProgramID, t.QuestionSetID, t.Slug, t.Name, t.Description,
		t.EnableMCQ, t.LogicTestDurationMinutes, t.LogicTestPassingScore,
		t.AllowRetake, t.EnableAIInterview, t.AIInterviewInstructions,
		questionsJSON, rubricJSON,
	).Scan(
		&res.ID, &res.ProgramID, &res.QuestionSetID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &rawRubric, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("track_repo: create: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &res.AIInterviewRubric)
	}
	if res.AIInterviewRubric == nil && (res.Slug == "fullstack" || res.Slug == "qa-automation") {
		res.AIInterviewRubric = model.DefaultLITRubric()
	}
	return &res, nil
}

func (r *TrackRepository) Update(ctx context.Context, t *model.Track) (*model.Track, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		track, ok := r.memTracks[t.ID]
		if !ok {
			return nil, ErrTrackNotFound
		}
		track.QuestionSetID = t.QuestionSetID
		track.Name = t.Name
		track.Description = t.Description
		track.EnableMCQ = t.EnableMCQ
		track.LogicTestDurationMinutes = t.LogicTestDurationMinutes
		track.LogicTestPassingScore = t.LogicTestPassingScore
		track.AllowRetake = t.AllowRetake
		track.EnableAIInterview = t.EnableAIInterview
		track.AIInterviewInstructions = t.AIInterviewInstructions
		track.AIInterviewQuestions = t.AIInterviewQuestions
		if t.AIInterviewRubric != nil {
			track.AIInterviewRubric = t.AIInterviewRubric
		}
		track.UpdatedAt = time.Now()
		return track, nil
	}

	questionsJSON, err := json.Marshal(t.AIInterviewQuestions)
	if err != nil {
		questionsJSON = []byte("[]")
	}

	rubricJSON, _ := json.Marshal(t.AIInterviewRubric)
	if t.AIInterviewRubric == nil {
		rubricJSON = []byte("null")
	}

	query := `
		UPDATE program_tracks SET
			question_set_id = $2,
			name = $3,
			description = $4,
			enable_mcq = $5,
			logic_test_duration_minutes = $6,
			logic_test_passing_score = $7,
			allow_retake = $8,
			enable_ai_interview = $9,
			ai_interview_instructions = $10,
			ai_interview_questions = $11,
			ai_interview_rubric = $12,
			updated_at = now()
		WHERE id = $1
		RETURNING id, program_id, question_set_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, COALESCE(ai_interview_rubric, 'null'::jsonb), created_at, updated_at
	`

	var res model.Track
	var rawQuestions []byte
	var rawRubric []byte
	err = r.pool.QueryRow(ctx, query,
		t.ID, t.QuestionSetID, t.Name, t.Description,
		t.EnableMCQ, t.LogicTestDurationMinutes, t.LogicTestPassingScore,
		t.AllowRetake, t.EnableAIInterview, t.AIInterviewInstructions,
		questionsJSON, rubricJSON,
	).Scan(
		&res.ID, &res.ProgramID, &res.QuestionSetID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &rawRubric, &res.CreatedAt, &res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTrackNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("track_repo: update: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &res.AIInterviewRubric)
	}
	if res.AIInterviewRubric == nil && (res.Slug == "fullstack" || res.Slug == "qa-automation") {
		res.AIInterviewRubric = model.DefaultLITRubric()
	}
	return &res, nil
}

func (r *TrackRepository) UpdateRubric(ctx context.Context, id uuid.UUID, rubric *model.AIInterviewRubric) (*model.Track, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		track, ok := r.memTracks[id]
		if !ok {
			return nil, ErrTrackNotFound
		}
		track.AIInterviewRubric = rubric
		if rubric != nil && len(rubric.Questions) > 0 {
			qTexts := make([]string, len(rubric.Questions))
			for i, q := range rubric.Questions {
				qTexts[i] = q.Question
			}
			track.AIInterviewQuestions = qTexts
		}
		track.UpdatedAt = time.Now()
		return track, nil
	}

	rubricJSON, _ := json.Marshal(rubric)
	var questionTexts []string
	if rubric != nil {
		for _, q := range rubric.Questions {
			questionTexts = append(questionTexts, q.Question)
		}
	}
	qJSON, _ := json.Marshal(questionTexts)

	query := `
		UPDATE program_tracks SET
			ai_interview_rubric = $2,
			ai_interview_questions = CASE WHEN $3::text = '[]' THEN ai_interview_questions ELSE $3::jsonb END,
			updated_at = now()
		WHERE id = $1
		RETURNING id, program_id, question_set_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, COALESCE(ai_interview_rubric, 'null'::jsonb), created_at, updated_at
	`

	var res model.Track
	var rawQuestions []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, id, rubricJSON, string(qJSON)).Scan(
		&res.ID, &res.ProgramID, &res.QuestionSetID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &rawRubric, &res.CreatedAt, &res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTrackNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("track_repo: update rubric: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &res.AIInterviewRubric)
	}
	if res.AIInterviewRubric == nil && (res.Slug == "fullstack" || res.Slug == "qa-automation") {
		res.AIInterviewRubric = model.DefaultLITRubric()
	}
	return &res, nil
}

func (r *TrackRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Track, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		track, ok := r.memTracks[id]
		if !ok {
			return nil, ErrTrackNotFound
		}
		if track.AIInterviewRubric == nil && (track.Slug == "fullstack" || track.Slug == "qa-automation") {
			track.AIInterviewRubric = model.DefaultLITRubric()
		}
		return track, nil
	}

	query := `
		SELECT
			t.id, t.program_id, t.question_set_id, t.slug, t.name, COALESCE(t.description, ''),
			t.enable_mcq, t.logic_test_duration_minutes, t.logic_test_passing_score,
			t.allow_retake, t.enable_ai_interview, COALESCE(t.ai_interview_instructions, ''),
			t.ai_interview_questions, COALESCE(t.ai_interview_rubric, 'null'::jsonb), t.created_at, t.updated_at,
			COALESCE(qs.name, '') as question_set_name,
			(SELECT COUNT(*) FROM mcq_questions mq WHERE mq.question_set_id = t.question_set_id OR (t.question_set_id IS NULL AND mq.track_id = t.id)) as question_count
		FROM program_tracks t
		LEFT JOIN question_sets qs ON qs.id = t.question_set_id
		WHERE t.id = $1
	`

	var res model.Track
	var rawQuestions []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&res.ID, &res.ProgramID, &res.QuestionSetID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &rawRubric, &res.CreatedAt, &res.UpdatedAt,
		&res.QuestionSetName, &res.QuestionCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTrackNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("track_repo: get by id: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &res.AIInterviewRubric)
	}
	if res.AIInterviewRubric == nil && (res.Slug == "fullstack" || res.Slug == "qa-automation") {
		res.AIInterviewRubric = model.DefaultLITRubric()
	}
	return &res, nil
}

func (r *TrackRepository) GetBySlug(ctx context.Context, programID uuid.UUID, slug string) (*model.Track, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, t := range r.memTracks {
			if t.ProgramID == programID && t.Slug == slug {
				if t.AIInterviewRubric == nil && (t.Slug == "fullstack" || t.Slug == "qa-automation") {
					t.AIInterviewRubric = model.DefaultLITRubric()
				}
				return t, nil
			}
		}
		return nil, ErrTrackNotFound
	}

	query := `
		SELECT
			t.id, t.program_id, t.question_set_id, t.slug, t.name, COALESCE(t.description, ''),
			t.enable_mcq, t.logic_test_duration_minutes, t.logic_test_passing_score,
			t.allow_retake, t.enable_ai_interview, COALESCE(t.ai_interview_instructions, ''),
			t.ai_interview_questions, COALESCE(t.ai_interview_rubric, 'null'::jsonb), t.created_at, t.updated_at,
			COALESCE(qs.name, '') as question_set_name,
			(SELECT COUNT(*) FROM mcq_questions mq WHERE mq.question_set_id = t.question_set_id OR (t.question_set_id IS NULL AND mq.track_id = t.id)) as question_count
		FROM program_tracks t
		LEFT JOIN question_sets qs ON qs.id = t.question_set_id
		WHERE t.program_id = $1 AND t.slug = $2
	`

	var res model.Track
	var rawQuestions []byte
	var rawRubric []byte
	err := r.pool.QueryRow(ctx, query, programID, slug).Scan(
		&res.ID, &res.ProgramID, &res.QuestionSetID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &rawRubric, &res.CreatedAt, &res.UpdatedAt,
		&res.QuestionSetName, &res.QuestionCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTrackNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("track_repo: get by slug: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	if len(rawRubric) > 0 && string(rawRubric) != "null" {
		_ = json.Unmarshal(rawRubric, &res.AIInterviewRubric)
	}
	if res.AIInterviewRubric == nil && (res.Slug == "fullstack" || res.Slug == "qa-automation") {
		res.AIInterviewRubric = model.DefaultLITRubric()
	}
	return &res, nil
}

func (r *TrackRepository) ListByProgram(ctx context.Context, programID uuid.UUID) ([]model.Track, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.Track
		for _, t := range r.memTracks {
			if t.ProgramID == programID {
				item := *t
				if item.AIInterviewRubric == nil && (item.Slug == "fullstack" || item.Slug == "qa-automation") {
					item.AIInterviewRubric = model.DefaultLITRubric()
				}
				list = append(list, item)
			}
		}
		return list, nil
	}

	query := `
		SELECT
			t.id, t.program_id, t.question_set_id, t.slug, t.name, COALESCE(t.description, ''),
			t.enable_mcq, t.logic_test_duration_minutes, t.logic_test_passing_score,
			t.allow_retake, t.enable_ai_interview, COALESCE(t.ai_interview_instructions, ''),
			t.ai_interview_questions, COALESCE(t.ai_interview_rubric, 'null'::jsonb), t.created_at, t.updated_at,
			COALESCE(qs.name, '') as question_set_name,
			(SELECT COUNT(*) FROM mcq_questions mq WHERE mq.question_set_id = t.question_set_id OR (t.question_set_id IS NULL AND mq.track_id = t.id)) as question_count
		FROM program_tracks t
		LEFT JOIN question_sets qs ON qs.id = t.question_set_id
		WHERE t.program_id = $1
		ORDER BY t.created_at ASC
	`

	rows, err := r.pool.Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("track_repo: list by program: %w", err)
	}
	defer rows.Close()

	var list []model.Track
	for rows.Next() {
		var res model.Track
		var rawQuestions []byte
		var rawRubric []byte
		if err := rows.Scan(
			&res.ID, &res.ProgramID, &res.QuestionSetID, &res.Slug, &res.Name, &res.Description,
			&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
			&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
			&rawQuestions, &rawRubric, &res.CreatedAt, &res.UpdatedAt,
			&res.QuestionSetName, &res.QuestionCount,
		); err != nil {
			return nil, fmt.Errorf("track_repo: scan: %w", err)
		}
		_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
		if len(rawRubric) > 0 && string(rawRubric) != "null" {
			_ = json.Unmarshal(rawRubric, &res.AIInterviewRubric)
		}
		if res.AIInterviewRubric == nil && (res.Slug == "fullstack" || res.Slug == "qa-automation") {
			res.AIInterviewRubric = model.DefaultLITRubric()
		}
		list = append(list, res)
	}
	return list, rows.Err()
}

func (r *TrackRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		delete(r.memTracks, id)
		return nil
	}

	query := `DELETE FROM program_tracks WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("track_repo: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrTrackNotFound
	}
	return nil
}
