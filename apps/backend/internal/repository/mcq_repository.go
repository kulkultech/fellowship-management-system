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

var ErrMCQNotFound = errors.New("mcq question not found")

type MCQRepository struct {
	pool    *pgxpool.Pool
	mu      sync.RWMutex
	memMCQs []model.MCQQuestion
}

func NewMCQRepository(pool *pgxpool.Pool) *MCQRepository {
	repo := &MCQRepository{
		pool:    pool,
		memMCQs: make([]model.MCQQuestion, 0),
	}
	progID := uuid.MustParse("00000000-0000-0000-0000-000000000003")

	var bank QuestionBankData
	if err := json.Unmarshal(litQuestionsJSON, &bank); err == nil && len(bank.QAAssessment) > 0 {
		for _, q := range bank.QAAssessment {
			var opts []model.MCQOption
			for _, o := range q.Options {
				opts = append(opts, model.MCQOption{ID: o.ID, Text: o.Text})
			}
			points := q.Points
			if points <= 0 {
				points = 10
			}
			repo.memMCQs = append(repo.memMCQs, model.MCQQuestion{
				ID:              uuid.New(),
				ProgramID:       progID,
				Category:        q.Category,
				QuestionText:    q.QuestionText,
				Options:         opts,
				CorrectOptionID: q.CorrectOptionID,
				Explanation:     q.Explanation,
				Points:          points,
				CreatedAt:       time.Now(),
				UpdatedAt:       time.Now(),
			})
		}
	}
	return repo
}

func (r *MCQRepository) Create(ctx context.Context, q *model.MCQQuestion) (*model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if q.ID == uuid.Nil {
			q.ID = uuid.New()
		}
		q.CreatedAt = time.Now()
		q.UpdatedAt = time.Now()
		r.memMCQs = append(r.memMCQs, *q)
		return q, nil
	}

	optionsJSON, err := json.Marshal(q.Options)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: marshal options: %w", err)
	}

	query := `
		INSERT INTO mcq_questions (
			program_id, category, question_text, options, correct_option_id,
			explanation, points, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
		RETURNING id, program_id, category, question_text, options, correct_option_id,
			explanation, points, created_at, updated_at
	`
	var res model.MCQQuestion
	var rawOptions []byte
	err = r.pool.QueryRow(ctx, query,
		q.ProgramID, q.Category, q.QuestionText, optionsJSON, q.CorrectOptionID,
		q.Explanation, q.Points,
	).Scan(
		&res.ID, &res.ProgramID, &res.Category, &res.QuestionText, &rawOptions,
		&res.CorrectOptionID, &res.Explanation, &res.Points,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: create: %w", err)
	}
	if err := json.Unmarshal(rawOptions, &res.Options); err != nil {
		return nil, fmt.Errorf("mcq_repo: unmarshal options: %w", err)
	}
	return &res, nil
}

func (r *MCQRepository) ListByProgram(ctx context.Context, programID uuid.UUID) ([]model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		return r.memMCQs, nil
	}

	query := `
		SELECT id, program_id, category, question_text, options, correct_option_id,
			explanation, points, created_at, updated_at
		FROM mcq_questions
		WHERE program_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: list by program: %w", err)
	}
	defer rows.Close()

	var list []model.MCQQuestion
	for rows.Next() {
		var q model.MCQQuestion
		var rawOptions []byte
		if err := rows.Scan(
			&q.ID, &q.ProgramID, &q.Category, &q.QuestionText, &rawOptions,
			&q.CorrectOptionID, &q.Explanation, &q.Points,
			&q.CreatedAt, &q.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("mcq_repo: scan: %w", err)
		}
		if err := json.Unmarshal(rawOptions, &q.Options); err != nil {
			return nil, fmt.Errorf("mcq_repo: unmarshal options: %w", err)
		}
		list = append(list, q)
	}
	return list, rows.Err()
}

func (r *MCQRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, q := range r.memMCQs {
			if q.ID == id {
				return &q, nil
			}
		}
		return nil, ErrMCQNotFound
	}

	query := `
		SELECT id, program_id, category, question_text, options, correct_option_id,
			explanation, points, created_at, updated_at
		FROM mcq_questions
		WHERE id = $1
	`
	var q model.MCQQuestion
	var rawOptions []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&q.ID, &q.ProgramID, &q.Category, &q.QuestionText, &rawOptions,
		&q.CorrectOptionID, &q.Explanation, &q.Points,
		&q.CreatedAt, &q.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMCQNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: get by id: %w", err)
	}
	if err := json.Unmarshal(rawOptions, &q.Options); err != nil {
		return nil, fmt.Errorf("mcq_repo: unmarshal options: %w", err)
	}
	return &q, nil
}

func (r *MCQRepository) ListByTrack(ctx context.Context, trackID uuid.UUID) ([]model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.MCQQuestion
		for _, q := range r.memMCQs {
			if q.TrackID != nil && *q.TrackID == trackID {
				list = append(list, q)
			}
		}
		if len(list) == 0 {
			return r.memMCQs, nil
		}
		return list, nil
	}

	query := `
		SELECT id, program_id, track_id, category, question_text, options, correct_option_id,
			explanation, points, created_at, updated_at
		FROM mcq_questions
		WHERE track_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, trackID)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: list by track: %w", err)
	}
	defer rows.Close()

	var list []model.MCQQuestion
	for rows.Next() {
		var q model.MCQQuestion
		var rawOptions []byte
		if err := rows.Scan(
			&q.ID, &q.ProgramID, &q.TrackID, &q.Category, &q.QuestionText, &rawOptions,
			&q.CorrectOptionID, &q.Explanation, &q.Points,
			&q.CreatedAt, &q.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("mcq_repo: scan: %w", err)
		}
		if err := json.Unmarshal(rawOptions, &q.Options); err != nil {
			return nil, fmt.Errorf("mcq_repo: unmarshal options: %w", err)
		}
		list = append(list, q)
	}
	return list, rows.Err()
}

func (r *MCQRepository) ReplaceTrackQuestions(ctx context.Context, programID, trackID uuid.UUID, questions []model.MCQQuestion) ([]model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		var filtered []model.MCQQuestion
		for _, q := range r.memMCQs {
			if q.TrackID == nil || *q.TrackID != trackID {
				filtered = append(filtered, q)
			}
		}
		var saved []model.MCQQuestion
		for _, q := range questions {
			if q.ID == uuid.Nil {
				q.ID = uuid.New()
			}
			q.ProgramID = programID
			q.TrackID = &trackID
			q.CreatedAt = time.Now()
			q.UpdatedAt = time.Now()
			filtered = append(filtered, q)
			saved = append(saved, q)
		}
		r.memMCQs = filtered
		return saved, nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete existing track questions
	_, err = tx.Exec(ctx, `DELETE FROM mcq_questions WHERE track_id = $1`, trackID)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: delete track existing: %w", err)
	}

	var saved []model.MCQQuestion
	for _, q := range questions {
		if q.ID == uuid.Nil {
			q.ID = uuid.New()
		}
		optionsJSON, err := json.Marshal(q.Options)
		if err != nil {
			return nil, fmt.Errorf("mcq_repo: marshal options: %w", err)
		}
		query := `
			INSERT INTO mcq_questions (
				id, program_id, track_id, category, question_text, options, correct_option_id,
				explanation, points, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
			RETURNING id, program_id, track_id, category, question_text, options, correct_option_id,
				explanation, points, created_at, updated_at
		`
		var res model.MCQQuestion
		var rawOptions []byte
		err = tx.QueryRow(ctx, query,
			q.ID, programID, trackID, q.Category, q.QuestionText, optionsJSON, q.CorrectOptionID,
			q.Explanation, q.Points,
		).Scan(
			&res.ID, &res.ProgramID, &res.TrackID, &res.Category, &res.QuestionText, &rawOptions,
			&res.CorrectOptionID, &res.Explanation, &res.Points,
			&res.CreatedAt, &res.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("mcq_repo: insert track question: %w", err)
		}
		_ = json.Unmarshal(rawOptions, &res.Options)
		saved = append(saved, res)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("mcq_repo: commit tx: %w", err)
	}
	return saved, nil
}

func (r *MCQRepository) ReplaceProgramQuestions(ctx context.Context, programID uuid.UUID, questions []model.MCQQuestion) ([]model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		var filtered []model.MCQQuestion
		for _, q := range r.memMCQs {
			if q.ProgramID != programID {
				filtered = append(filtered, q)
			}
		}
		var saved []model.MCQQuestion
		for _, q := range questions {
			if q.ID == uuid.Nil {
				q.ID = uuid.New()
			}
			q.ProgramID = programID
			q.CreatedAt = time.Now()
			q.UpdatedAt = time.Now()
			filtered = append(filtered, q)
			saved = append(saved, q)
		}
		r.memMCQs = filtered
		return saved, nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete existing questions
	_, err = tx.Exec(ctx, `DELETE FROM mcq_questions WHERE program_id = $1`, programID)
	if err != nil {
		return nil, fmt.Errorf("mcq_repo: delete existing: %w", err)
	}

	var saved []model.MCQQuestion
	for _, q := range questions {
		if q.ID == uuid.Nil {
			q.ID = uuid.New()
		}
		optionsJSON, err := json.Marshal(q.Options)
		if err != nil {
			return nil, fmt.Errorf("mcq_repo: marshal options: %w", err)
		}
		query := `
			INSERT INTO mcq_questions (
				id, program_id, category, question_text, options, correct_option_id,
				explanation, points, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
			RETURNING id, program_id, category, question_text, options, correct_option_id,
				explanation, points, created_at, updated_at
		`
		var res model.MCQQuestion
		var rawOptions []byte
		err = tx.QueryRow(ctx, query,
			q.ID, programID, q.Category, q.QuestionText, optionsJSON, q.CorrectOptionID,
			q.Explanation, q.Points,
		).Scan(
			&res.ID, &res.ProgramID, &res.Category, &res.QuestionText, &rawOptions,
			&res.CorrectOptionID, &res.Explanation, &res.Points,
			&res.CreatedAt, &res.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("mcq_repo: insert question: %w", err)
		}
		_ = json.Unmarshal(rawOptions, &res.Options)
		saved = append(saved, res)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("mcq_repo: commit tx: %w", err)
	}
	return saved, nil
}

