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
	// Pre-seed 10 questions for in-memory mode
	repo.memMCQs = []model.MCQQuestion{
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000001"),
			ProgramID:    progID,
			Category:     "Logic & Problem Solving",
			QuestionText: "In a microservice system, Service A sends requests to Service B. If Service B becomes sluggish or intermittently times out, which pattern prevents Service A's thread pool from exhausting resources?",
			Options: []model.MCQOption{
				{ID: "a", Text: "Saga Pattern"},
				{ID: "b", Text: "Circuit Breaker Pattern"},
				{ID: "c", Text: "Two-Phase Commit"},
				{ID: "d", Text: "Event Sourcing"},
			},
			CorrectOptionID: "b",
			Explanation:     "The Circuit Breaker pattern prevents an application from repeatedly trying to execute an operation that's likely to fail, shielding upstream resources.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000002"),
			ProgramID:    progID,
			Category:     "Data Structures & Algorithms",
			QuestionText: "What is the average time complexity of searching for an element in a balanced Binary Search Tree (AVL or Red-Black Tree) containing N elements?",
			Options: []model.MCQOption{
				{ID: "a", Text: "O(1)"},
				{ID: "b", Text: "O(log N)"},
				{ID: "c", Text: "O(N)"},
				{ID: "d", Text: "O(N log N)"},
			},
			CorrectOptionID: "b",
			Explanation:     "A balanced BST maintains height proportional to log2(N), guaranteeing O(log N) lookup, insertion, and deletion times.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000003"),
			ProgramID:    progID,
			Category:     "Concurrency & Systems",
			QuestionText: "When two goroutines/threads read and write to the same memory address without synchronization, what race condition hazard occurs?",
			Options: []model.MCQOption{
				{ID: "a", Text: "Data Race & Undefined Memory State"},
				{ID: "b", Text: "Automatic Garbage Collection Pause"},
				{ID: "c", Text: "Deterministic Deadlock"},
				{ID: "d", Text: "Thread Starvation Only"},
			},
			CorrectOptionID: "a",
			Explanation:     "Concurrent unsynchronized read-write access to shared memory results in a data race leading to memory corruption and unpredictable behavior.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000004"),
			ProgramID:    progID,
			Category:     "Logic & Deductive Reasoning",
			QuestionText: "If all asynchronous HTTP calls return Promises, and all database transactions in our repository return Promises, which of the following is logically valid?",
			Options: []model.MCQOption{
				{ID: "a", Text: "All Promises are database transactions"},
				{ID: "b", Text: "Any non-Promise function is neither an async HTTP call nor a database transaction"},
				{ID: "c", Text: "All HTTP calls are database transactions"},
				{ID: "d", Text: "No HTTP calls can be chained"},
			},
			CorrectOptionID: "b",
			Explanation:     "By contraposition (If P -> Q, then not Q -> not P), if a function does not return a Promise, it cannot be an async HTTP call or DB transaction.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000005"),
			ProgramID:    progID,
			Category:     "Database & Architecture",
			QuestionText: "Which database isolation level prevents dirty reads, non-repeatable reads, and phantom reads?",
			Options: []model.MCQOption{
				{ID: "a", Text: "Read Committed"},
				{ID: "b", Text: "Repeatable Read"},
				{ID: "c", Text: "Serializable"},
				{ID: "d", Text: "Read Uncommitted"},
			},
			CorrectOptionID: "c",
			Explanation:     "Serializable isolation offers the highest level of consistency by simulating sequential transaction execution.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000006"),
			ProgramID:    progID,
			Category:     "Software Engineering Design",
			QuestionText: "In the Dependency Inversion Principle (DIP) of SOLID, what should high-level modules depend upon?",
			Options: []model.MCQOption{
				{ID: "a", Text: "Low-level concrete implementations"},
				{ID: "b", Text: "Abstractions / Interfaces"},
				{ID: "c", Text: "Global Singleton instances"},
				{ID: "d", Text: "Static helper functions"},
			},
			CorrectOptionID: "b",
			Explanation:     "DIP states that high-level modules should not depend on low-level modules; both should depend on abstractions.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000007"),
			ProgramID:    progID,
			Category:     "Web Security",
			QuestionText: "Which cookie attribute prevents client-side JavaScript (e.g. `document.cookie`) from accessing sensitive session tokens, mitigating XSS token theft?",
			Options: []model.MCQOption{
				{ID: "a", Text: "SameSite=Strict"},
				{ID: "b", Text: "HttpOnly"},
				{ID: "c", Text: "Secure"},
				{ID: "d", Text: "Domain"},
			},
			CorrectOptionID: "b",
			Explanation:     "The HttpOnly flag directs browsers to block JavaScript access to the cookie, neutralizing XSS credential theft.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000008"),
			ProgramID:    progID,
			Category:     "Logic & Problem Solving",
			QuestionText: "You have an array of integers where every element appears twice except for one unique element. What bitwise operation can find the unique element in O(N) time and O(1) space?",
			Options: []model.MCQOption{
				{ID: "a", Text: "Bitwise AND (&)"},
				{ID: "b", Text: "Bitwise XOR (^)"},
				{ID: "c", Text: "Bitwise OR (|)"},
				{ID: "d", Text: "Bitwise NOT (~)"},
			},
			CorrectOptionID: "b",
			Explanation:     "XOR has the properties: X ^ X = 0 and X ^ 0 = X. XORing all elements cancels duplicate pairs, leaving only the unique integer.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000009"),
			ProgramID:    progID,
			Category:     "System Performance",
			QuestionText: "Which HTTP header is utilized by web browsers to negotiate compressed transfer representations (e.g. gzip, br) from the origin server?",
			Options: []model.MCQOption{
				{ID: "a", Text: "Accept-Encoding"},
				{ID: "b", Text: "Content-Type"},
				{ID: "c", Text: "Cache-Control"},
				{ID: "d", Text: "Transfer-Encoding"},
			},
			CorrectOptionID: "a",
			Explanation:     "Browsers send `Accept-Encoding: gzip, br` to inform the server which compression algorithms they support.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:           uuid.MustParse("10000000-0000-0000-0000-000000000010"),
			ProgramID:    progID,
			Category:     "Logic & Architecture",
			QuestionText: "In an idempotent REST API design, which of the following HTTP methods MUST produce the same resource state regardless of how many times identical requests are executed?",
			Options: []model.MCQOption{
				{ID: "a", Text: "POST"},
				{ID: "b", Text: "PUT and DELETE"},
				{ID: "c", Text: "PATCH only"},
				{ID: "d", Text: "No HTTP methods are guaranteed idempotent"},
			},
			CorrectOptionID: "b",
			Explanation:     "PUT (replace state) and DELETE (remove resource) are idempotent by RFC specifications; repeating them leaves the system in the same final state.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
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
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
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

