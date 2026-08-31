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
	if pool == nil {
		litProgID := uuid.MustParse("00000000-0000-0000-0000-000000000003")
		t1ID := uuid.MustParse("00000000-0000-0000-0000-000000000011")
		t2ID := uuid.MustParse("00000000-0000-0000-0000-000000000012")
		t3ID := uuid.MustParse("00000000-0000-0000-0000-000000000013")
		repo.memTracks[t1ID] = &model.Track{
			ID:                       t1ID,
			ProgramID:                litProgID,
			Slug:                     "qa-automation",
			Name:                     "QA & Test Automation Track",
			Description:              "Hands-on assessment covering Cypress, Postman, Systems, Regression testing, and problem solving.",
			EnableMCQ:                true,
			LogicTestDurationMinutes: 35,
			LogicTestPassingScore:    70,
			AllowRetake:              false,
			EnableAIInterview:        true,
			AIInterviewQuestions: []string{
				"How do you design an end-to-end regression test suite that minimizes flaky tests?",
				"Explain how you would test an asynchronous event-driven payment webhook.",
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		repo.memTracks[t2ID] = &model.Track{
			ID:                       t2ID,
			ProgramID:                litProgID,
			Slug:                     "fullstack",
			Name:                     "Fullstack Software Engineering Track",
			Description:              "Fullstack engineering assessment covering modern JS DOM, HTML/CSS, Java OOP, and REST APIs.",
			EnableMCQ:                true,
			LogicTestDurationMinutes: 35,
			LogicTestPassingScore:    70,
			AllowRetake:              false,
			EnableAIInterview:        true,
			AIInterviewQuestions: []string{
				"Describe how you handle state synchronization between client and server in real-time apps.",
				"How do you optimize slow SQL queries and resolve N+1 problems in ORMs?",
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		repo.memTracks[t3ID] = &model.Track{
			ID:                       t3ID,
			ProgramID:                litProgID,
			Slug:                     "service-desk-analyst",
			Name:                     "Service Desk Analyst (SDA) Track",
			Description:              "ITIL Incident Management, Customer Empathy, SLAs, and support ticketing workflows.",
			EnableMCQ:                true,
			LogicTestDurationMinutes: 30,
			LogicTestPassingScore:    70,
			AllowRetake:              false,
			EnableAIInterview:        true,
			AIInterviewQuestions: []string{
				"How do you prioritize and triage P1 critical incidents versus high-volume minor tickets?",
				"Explain how you de-escalate an upset enterprise stakeholder during a production outage.",
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
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

	query := `
		INSERT INTO program_tracks (
			program_id, slug, name, description,
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, ai_interview_instructions,
			ai_interview_questions, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
		ON CONFLICT (program_id, slug) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			enable_mcq = EXCLUDED.enable_mcq,
			logic_test_duration_minutes = EXCLUDED.logic_test_duration_minutes,
			logic_test_passing_score = EXCLUDED.logic_test_passing_score,
			allow_retake = EXCLUDED.allow_retake,
			enable_ai_interview = EXCLUDED.enable_ai_interview,
			ai_interview_instructions = EXCLUDED.ai_interview_instructions,
			ai_interview_questions = EXCLUDED.ai_interview_questions,
			updated_at = now()
		RETURNING id, program_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, created_at, updated_at
	`

	var res model.Track
	var rawQuestions []byte
	err = r.pool.QueryRow(ctx, query,
		t.ProgramID, t.Slug, t.Name, t.Description,
		t.EnableMCQ, t.LogicTestDurationMinutes, t.LogicTestPassingScore,
		t.AllowRetake, t.EnableAIInterview, t.AIInterviewInstructions,
		questionsJSON,
	).Scan(
		&res.ID, &res.ProgramID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("track_repo: create: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
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
		track.Name = t.Name
		track.Description = t.Description
		track.EnableMCQ = t.EnableMCQ
		track.LogicTestDurationMinutes = t.LogicTestDurationMinutes
		track.LogicTestPassingScore = t.LogicTestPassingScore
		track.AllowRetake = t.AllowRetake
		track.EnableAIInterview = t.EnableAIInterview
		track.AIInterviewInstructions = t.AIInterviewInstructions
		track.AIInterviewQuestions = t.AIInterviewQuestions
		track.UpdatedAt = time.Now()
		return track, nil
	}

	questionsJSON, err := json.Marshal(t.AIInterviewQuestions)
	if err != nil {
		questionsJSON = []byte("[]")
	}

	query := `
		UPDATE program_tracks SET
			name = $2,
			description = $3,
			enable_mcq = $4,
			logic_test_duration_minutes = $5,
			logic_test_passing_score = $6,
			allow_retake = $7,
			enable_ai_interview = $8,
			ai_interview_instructions = $9,
			ai_interview_questions = $10,
			updated_at = now()
		WHERE id = $1
		RETURNING id, program_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, created_at, updated_at
	`

	var res model.Track
	var rawQuestions []byte
	err = r.pool.QueryRow(ctx, query,
		t.ID, t.Name, t.Description,
		t.EnableMCQ, t.LogicTestDurationMinutes, t.LogicTestPassingScore,
		t.AllowRetake, t.EnableAIInterview, t.AIInterviewInstructions,
		questionsJSON,
	).Scan(
		&res.ID, &res.ProgramID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &res.CreatedAt, &res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTrackNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("track_repo: update: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
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
		return track, nil
	}

	query := `
		SELECT id, program_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, created_at, updated_at
		FROM program_tracks
		WHERE id = $1
	`

	var res model.Track
	var rawQuestions []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&res.ID, &res.ProgramID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &res.CreatedAt, &res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTrackNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("track_repo: get by id: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	return &res, nil
}

func (r *TrackRepository) GetBySlug(ctx context.Context, programID uuid.UUID, slug string) (*model.Track, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, t := range r.memTracks {
			if t.ProgramID == programID && t.Slug == slug {
				return t, nil
			}
		}
		return nil, ErrTrackNotFound
	}

	query := `
		SELECT id, program_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, created_at, updated_at
		FROM program_tracks
		WHERE program_id = $1 AND slug = $2
	`

	var res model.Track
	var rawQuestions []byte
	err := r.pool.QueryRow(ctx, query, programID, slug).Scan(
		&res.ID, &res.ProgramID, &res.Slug, &res.Name, &res.Description,
		&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
		&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
		&rawQuestions, &res.CreatedAt, &res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTrackNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("track_repo: get by slug: %w", err)
	}

	_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
	return &res, nil
}

func (r *TrackRepository) ListByProgram(ctx context.Context, programID uuid.UUID) ([]model.Track, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.Track
		for _, t := range r.memTracks {
			if t.ProgramID == programID {
				list = append(list, *t)
			}
		}
		return list, nil
	}

	query := `
		SELECT id, program_id, slug, name, COALESCE(description, ''),
			enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
			allow_retake, enable_ai_interview, COALESCE(ai_interview_instructions, ''),
			ai_interview_questions, created_at, updated_at
		FROM program_tracks
		WHERE program_id = $1
		ORDER BY created_at ASC
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
		if err := rows.Scan(
			&res.ID, &res.ProgramID, &res.Slug, &res.Name, &res.Description,
			&res.EnableMCQ, &res.LogicTestDurationMinutes, &res.LogicTestPassingScore,
			&res.AllowRetake, &res.EnableAIInterview, &res.AIInterviewInstructions,
			&rawQuestions, &res.CreatedAt, &res.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("track_repo: scan: %w", err)
		}
		_ = json.Unmarshal(rawQuestions, &res.AIInterviewQuestions)
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
