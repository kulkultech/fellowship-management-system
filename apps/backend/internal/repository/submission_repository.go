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

var ErrSubmissionNotFound = errors.New("submission not found")

type SubmissionRepository struct {
	pool           *pgxpool.Pool
	mu             sync.RWMutex
	memSubmissions map[string]*model.TestSubmission
}

func NewSubmissionRepository(pool *pgxpool.Pool) *SubmissionRepository {
	return &SubmissionRepository{
		pool:           pool,
		memSubmissions: make(map[string]*model.TestSubmission),
	}
}

func (r *SubmissionRepository) Create(ctx context.Context, applicantID, programID uuid.UUID, testToken string) (*model.TestSubmission, error) {
	return r.CreateWithTrack(ctx, applicantID, programID, nil, testToken)
}

func (r *SubmissionRepository) CreateWithTrack(ctx context.Context, applicantID, programID uuid.UUID, trackID *uuid.UUID, testToken string) (*model.TestSubmission, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		s := &model.TestSubmission{
			ID:               uuid.New(),
			ApplicantID:      applicantID,
			ProgramID:        programID,
			TrackID:          trackID,
			TestToken:        testToken,
			StartedAt:        time.Now(),
			TimeSpentSeconds: 0,
			TotalScore:       0,
			Passed:           false,
			Answers:          []model.CandidateAnswer{},
			Status:           model.SubmissionInProgress,
			CreatedAt:        time.Now(),
			UpdatedAt:        time.Now(),
		}
		r.memSubmissions[testToken] = s
		return s, nil
	}

	query := `
		INSERT INTO test_submissions (
			applicant_id, program_id, track_id, test_token, started_at, answers, status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, now(), '[]'::jsonb, 'in_progress', now(), now())
		RETURNING id, applicant_id, program_id, track_id, test_token, started_at, submitted_at,
			time_spent_seconds, total_score, passed, answers, status, created_at, updated_at
	`
	var s model.TestSubmission
	var rawAnswers []byte
	err := r.pool.QueryRow(ctx, query, applicantID, programID, trackID, testToken).Scan(
		&s.ID, &s.ApplicantID, &s.ProgramID, &s.TrackID, &s.TestToken, &s.StartedAt, &s.SubmittedAt,
		&s.TimeSpentSeconds, &s.TotalScore, &s.Passed, &rawAnswers, &s.Status,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("submission_repo: create: %w", err)
	}
	s.Answers = []model.CandidateAnswer{}
	return &s, nil
}

func (r *SubmissionRepository) GetByToken(ctx context.Context, testToken string) (*model.TestSubmission, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		s, ok := r.memSubmissions[testToken]
		if !ok {
			return nil, ErrSubmissionNotFound
		}
		return s, nil
	}

	query := `
		SELECT id, applicant_id, program_id, track_id, test_token, started_at, submitted_at,
			time_spent_seconds, total_score, passed, answers, status, created_at, updated_at
		FROM test_submissions
		WHERE test_token = $1
	`
	var s model.TestSubmission
	var rawAnswers []byte
	err := r.pool.QueryRow(ctx, query, testToken).Scan(
		&s.ID, &s.ApplicantID, &s.ProgramID, &s.TrackID, &s.TestToken, &s.StartedAt, &s.SubmittedAt,
		&s.TimeSpentSeconds, &s.TotalScore, &s.Passed, &rawAnswers, &s.Status,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSubmissionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("submission_repo: get by token: %w", err)
	}
	if len(rawAnswers) > 0 {
		_ = json.Unmarshal(rawAnswers, &s.Answers)
	}
	return &s, nil
}

func (r *SubmissionRepository) GetByApplicantID(ctx context.Context, applicantID uuid.UUID) (*model.TestSubmission, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, s := range r.memSubmissions {
			if s.ApplicantID == applicantID {
				return s, nil
			}
		}
		return nil, ErrSubmissionNotFound
	}

	query := `
		SELECT id, applicant_id, program_id, track_id, test_token, started_at, submitted_at,
			time_spent_seconds, total_score, passed, answers, status, created_at, updated_at
		FROM test_submissions
		WHERE applicant_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var s model.TestSubmission
	var rawAnswers []byte
	err := r.pool.QueryRow(ctx, query, applicantID).Scan(
		&s.ID, &s.ApplicantID, &s.ProgramID, &s.TrackID, &s.TestToken, &s.StartedAt, &s.SubmittedAt,
		&s.TimeSpentSeconds, &s.TotalScore, &s.Passed, &rawAnswers, &s.Status,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSubmissionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("submission_repo: get by applicant: %w", err)
	}
	if len(rawAnswers) > 0 {
		_ = json.Unmarshal(rawAnswers, &s.Answers)
	}
	return &s, nil
}

func (r *SubmissionRepository) CompleteSubmission(
	ctx context.Context,
	id uuid.UUID,
	submittedAt time.Time,
	timeSpentSeconds int,
	totalScore int,
	passed bool,
	answers []model.CandidateAnswer,
	status model.SubmissionStatus,
) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, s := range r.memSubmissions {
			if s.ID == id {
				s.SubmittedAt = &submittedAt
				s.TimeSpentSeconds = timeSpentSeconds
				s.TotalScore = totalScore
				s.Passed = passed
				s.Answers = answers
				s.Status = status
				s.UpdatedAt = time.Now()
				return nil
			}
		}
		return ErrSubmissionNotFound
	}

	answersJSON, err := json.Marshal(answers)
	if err != nil {
		return fmt.Errorf("submission_repo: marshal answers: %w", err)
	}

	query := `
		UPDATE test_submissions
		SET submitted_at = $2,
			time_spent_seconds = $3,
			total_score = $4,
			passed = $5,
			answers = $6,
			status = $7,
			updated_at = now()
		WHERE id = $1
	`
	tag, err := r.pool.Exec(ctx, query, id, submittedAt, timeSpentSeconds, totalScore, passed, answersJSON, status)
	if err != nil {
		return fmt.Errorf("submission_repo: complete submission: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrSubmissionNotFound
	}
	return nil
}
