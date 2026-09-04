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

var ErrAIInterviewNotFound = errors.New("ai interview not found")

type AIInterviewRepository struct {
	pool          *pgxpool.Pool
	mu            sync.RWMutex
	memInterviews map[string]*model.AIInterview
}

func NewAIInterviewRepository(pool *pgxpool.Pool) *AIInterviewRepository {
	return &AIInterviewRepository{
		pool:          pool,
		memInterviews: make(map[string]*model.AIInterview),
	}
}

func (r *AIInterviewRepository) CreateInvitation(
	ctx context.Context,
	applicantID, programID uuid.UUID,
	invitationToken string,
	expiresAt time.Time,
) (*model.AIInterview, error) {
	return r.CreateInvitationWithTrack(ctx, applicantID, programID, nil, invitationToken, expiresAt)
}

func (r *AIInterviewRepository) CreateInvitationWithTrack(
	ctx context.Context,
	applicantID, programID uuid.UUID,
	trackID *uuid.UUID,
	invitationToken string,
	expiresAt time.Time,
) (*model.AIInterview, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		ai := &model.AIInterview{
			ID:                  uuid.New(),
			ApplicantID:         applicantID,
			ProgramID:           programID,
			TrackID:             trackID,
			InvitationToken:     invitationToken,
			InvitationExpiresAt: expiresAt,
			Transcript:          []model.ChatMessage{},
			ScorecardScore:      0,
			RecordingStatus:     "pending",
			Status:              model.AIInterviewInvited,
			CreatedAt:           time.Now(),
			UpdatedAt:           time.Now(),
		}
		r.memInterviews[invitationToken] = ai
		return ai, nil
	}

	query := `
		INSERT INTO ai_interviews (
			applicant_id, program_id, track_id, invite_token, invitation_token, invitation_expires_at,
			transcript, scorecard_score, recording_status, status,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $4, $5, '[]'::jsonb, 0, 'pending', 'invited', now(), now())
		ON CONFLICT (invitation_token) DO UPDATE SET
			invitation_expires_at = EXCLUDED.invitation_expires_at,
			updated_at = now()
		RETURNING id, applicant_id, program_id, track_id, COALESCE(invitation_token, invite_token, ''), invitation_expires_at,
			started_at, completed_at, transcript, summary_evaluation, scorecard_score,
			recording_status, recording_url, status, created_at, updated_at
	`
	var ai model.AIInterview
	var rawTranscript []byte
	var rawSummary []byte
	err := r.pool.QueryRow(ctx, query, applicantID, programID, trackID, invitationToken, expiresAt).Scan(
		&ai.ID, &ai.ApplicantID, &ai.ProgramID, &ai.TrackID, &ai.InvitationToken, &ai.InvitationExpiresAt,
		&ai.StartedAt, &ai.CompletedAt, &rawTranscript, &rawSummary, &ai.ScorecardScore,
		&ai.RecordingStatus, &ai.RecordingURL, &ai.Status, &ai.CreatedAt, &ai.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ai_interview_repo: create: %w", err)
	}
	ai.Transcript = []model.ChatMessage{}
	return &ai, nil
}

func (r *AIInterviewRepository) GetByToken(ctx context.Context, token string) (*model.AIInterview, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		ai, ok := r.memInterviews[token]
		if !ok {
			return nil, ErrAIInterviewNotFound
		}
		return ai, nil
	}

	query := `
		SELECT id, applicant_id, program_id, track_id, COALESCE(invitation_token, invite_token, ''), invitation_expires_at,
			started_at, completed_at, transcript, summary_evaluation, scorecard_score,
			recording_status, recording_url, status, created_at, updated_at
		FROM ai_interviews
		WHERE invitation_token = $1 OR invite_token = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var ai model.AIInterview
	var rawTranscript []byte
	var rawSummary []byte
	err := r.pool.QueryRow(ctx, query, token).Scan(
		&ai.ID, &ai.ApplicantID, &ai.ProgramID, &ai.TrackID, &ai.InvitationToken, &ai.InvitationExpiresAt,
		&ai.StartedAt, &ai.CompletedAt, &rawTranscript, &rawSummary, &ai.ScorecardScore,
		&ai.RecordingStatus, &ai.RecordingURL, &ai.Status, &ai.CreatedAt, &ai.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAIInterviewNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("ai_interview_repo: get by token: %w", err)
	}
	if len(rawTranscript) > 0 {
		_ = json.Unmarshal(rawTranscript, &ai.Transcript)
	}
	if len(rawSummary) > 0 {
		var summary model.EvaluationSummary
		if err := json.Unmarshal(rawSummary, &summary); err == nil {
			ai.SummaryEvaluation = &summary
		}
	}
	return &ai, nil
}

func (r *AIInterviewRepository) GetByApplicantID(ctx context.Context, applicantID uuid.UUID) (*model.AIInterview, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, ai := range r.memInterviews {
			if ai.ApplicantID == applicantID {
				return ai, nil
			}
		}
		return nil, ErrAIInterviewNotFound
	}

	query := `
		SELECT id, applicant_id, program_id, track_id, invitation_token, invitation_expires_at,
			started_at, completed_at, transcript, summary_evaluation, scorecard_score,
			recording_status, recording_url, status, created_at, updated_at
		FROM ai_interviews
		WHERE applicant_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var ai model.AIInterview
	var rawTranscript []byte
	var rawSummary []byte
	err := r.pool.QueryRow(ctx, query, applicantID).Scan(
		&ai.ID, &ai.ApplicantID, &ai.ProgramID, &ai.TrackID, &ai.InvitationToken, &ai.InvitationExpiresAt,
		&ai.StartedAt, &ai.CompletedAt, &rawTranscript, &rawSummary, &ai.ScorecardScore,
		&ai.RecordingStatus, &ai.RecordingURL, &ai.Status, &ai.CreatedAt, &ai.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAIInterviewNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("ai_interview_repo: get by applicant: %w", err)
	}
	if len(rawTranscript) > 0 {
		_ = json.Unmarshal(rawTranscript, &ai.Transcript)
	}
	if len(rawSummary) > 0 {
		var summary model.EvaluationSummary
		if err := json.Unmarshal(rawSummary, &summary); err == nil {
			ai.SummaryEvaluation = &summary
		}
	}
	return &ai, nil
}

func (r *AIInterviewRepository) UpdateSession(
	ctx context.Context,
	id uuid.UUID,
	startedAt, completedAt *time.Time,
	transcript []model.ChatMessage,
	summary *model.EvaluationSummary,
	scorecardScore int,
	status model.AIInterviewStatus,
) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, ai := range r.memInterviews {
			if ai.ID == id {
				if startedAt != nil {
					ai.StartedAt = startedAt
				}
				if completedAt != nil {
					ai.CompletedAt = completedAt
				}
				ai.Transcript = transcript
				ai.SummaryEvaluation = summary
				ai.ScorecardScore = scorecardScore
				ai.Status = status
				ai.UpdatedAt = time.Now()
				return nil
			}
		}
		return ErrAIInterviewNotFound
	}

	transcriptJSON, err := json.Marshal(transcript)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: marshal transcript: %w", err)
	}

	var summaryJSON []byte
	if summary != nil {
		summaryJSON, err = json.Marshal(summary)
		if err != nil {
			return fmt.Errorf("ai_interview_repo: marshal summary: %w", err)
		}
	}

	query := `
		UPDATE ai_interviews
		SET started_at = COALESCE($2, started_at),
			completed_at = COALESCE($3, completed_at),
			transcript = $4,
			summary_evaluation = $5,
			scorecard_score = $6,
			status = $7,
			updated_at = now()
		WHERE id = $1
	`
	tag, err := r.pool.Exec(ctx, query, id, startedAt, completedAt, transcriptJSON, summaryJSON, scorecardScore, status)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: update session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrAIInterviewNotFound
	}
	return nil
}

func (r *AIInterviewRepository) UpdateRecording(
	ctx context.Context,
	id uuid.UUID,
	recordingURL string,
	recordingStatus string,
) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, ai := range r.memInterviews {
			if ai.ID == id {
				ai.RecordingURL = recordingURL
				ai.RecordingStatus = recordingStatus
				ai.UpdatedAt = time.Now()
				return nil
			}
		}
		return ErrAIInterviewNotFound
	}

	query := `
		UPDATE ai_interviews
		SET recording_url = $2,
			recording_status = $3,
			updated_at = now()
		WHERE id = $1
	`
	tag, err := r.pool.Exec(ctx, query, id, recordingURL, recordingStatus)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: update recording: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrAIInterviewNotFound
	}
	return nil
}

