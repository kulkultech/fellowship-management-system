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
	memAttempts   []model.AIInterviewAttempt
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
		ON CONFLICT (invitation_token) WHERE invitation_token IS NOT NULL DO UPDATE SET
			invitation_expires_at = EXCLUDED.invitation_expires_at,
			updated_at = now()
		RETURNING id, applicant_id, program_id, track_id, COALESCE(invitation_token, invite_token, ''), COALESCE(invitation_expires_at, expires_at, now()),
			started_at, completed_at, transcript, summary_evaluation, scorecard_score,
			COALESCE(recording_status, 'pending'), COALESCE(recording_url, ''), status, created_at, updated_at, retake_deadline
	`
	var ai model.AIInterview
	var rawTranscript []byte
	var rawSummary []byte
	err := r.pool.QueryRow(ctx, query, applicantID, programID, trackID, invitationToken, expiresAt).Scan(
		&ai.ID, &ai.ApplicantID, &ai.ProgramID, &ai.TrackID, &ai.InvitationToken, &ai.InvitationExpiresAt,
		&ai.StartedAt, &ai.CompletedAt, &rawTranscript, &rawSummary, &ai.ScorecardScore,
		&ai.RecordingStatus, &ai.RecordingURL, &ai.Status, &ai.CreatedAt, &ai.UpdatedAt, &ai.RetakeDeadline,
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
		SELECT id, applicant_id, program_id, track_id, COALESCE(invitation_token, invite_token, ''), COALESCE(invitation_expires_at, expires_at, now()),
			started_at, completed_at, transcript, summary_evaluation, scorecard_score,
			COALESCE(recording_status, 'pending'), COALESCE(recording_url, ''), status, created_at, updated_at, retake_deadline
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
		&ai.RecordingStatus, &ai.RecordingURL, &ai.Status, &ai.CreatedAt, &ai.UpdatedAt, &ai.RetakeDeadline,
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
		SELECT id, applicant_id, program_id, track_id, COALESCE(invitation_token, invite_token, ''), COALESCE(invitation_expires_at, expires_at, now()),
			started_at, completed_at, transcript, summary_evaluation, scorecard_score,
			COALESCE(recording_status, 'pending'), COALESCE(recording_url, ''), status, created_at, updated_at, retake_deadline
		FROM ai_interviews
		WHERE applicant_id = $1
		ORDER BY (CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 WHEN status = 'completed' THEN 2 ELSE 3 END), created_at DESC
		LIMIT 1
	`
	var ai model.AIInterview
	var rawTranscript []byte
	var rawSummary []byte
	err := r.pool.QueryRow(ctx, query, applicantID).Scan(
		&ai.ID, &ai.ApplicantID, &ai.ProgramID, &ai.TrackID, &ai.InvitationToken, &ai.InvitationExpiresAt,
		&ai.StartedAt, &ai.CompletedAt, &rawTranscript, &rawSummary, &ai.ScorecardScore,
		&ai.RecordingStatus, &ai.RecordingURL, &ai.Status, &ai.CreatedAt, &ai.UpdatedAt, &ai.RetakeDeadline,
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
				if ai.Status != model.AIInterviewCompleted {
					ai.Status = model.AIInterviewCompleted
					now := time.Now()
					ai.CompletedAt = &now
				}
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
			status = CASE WHEN status = 'completed' THEN status ELSE 'completed'::varchar END,
			completed_at = COALESCE(completed_at, now()),
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

func (r *AIInterviewRepository) DeleteByApplicantID(ctx context.Context, applicantID uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for token, ai := range r.memInterviews {
			if ai.ApplicantID == applicantID {
				delete(r.memInterviews, token)
			}
		}
		return nil
	}

	_, err := r.pool.Exec(ctx, `DELETE FROM ai_interviews WHERE applicant_id = $1`, applicantID)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: delete by applicant id: %w", err)
	}
	return nil
}

func (r *AIInterviewRepository) ResetSession(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, ai := range r.memInterviews {
			if ai.ID == id {
				ai.StartedAt = nil
				ai.CompletedAt = nil
				ai.Transcript = []model.ChatMessage{}
				ai.SummaryEvaluation = nil
				ai.ScorecardScore = 0
				ai.RecordingURL = ""
				ai.RecordingStatus = "pending"
				ai.Status = model.AIInterviewInvited
				ai.UpdatedAt = time.Now()
				return nil
			}
		}
		return ErrAIInterviewNotFound
	}

	query := `
		UPDATE ai_interviews
		SET started_at = NULL,
			completed_at = NULL,
			transcript = '[]'::jsonb,
			summary_evaluation = NULL,
			scorecard_score = 0,
			recording_url = '',
			recording_status = 'pending',
			status = 'invited',
			updated_at = now()
		WHERE id = $1
	`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: reset session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrAIInterviewNotFound
	}
	return nil
}


// ArchiveAndReset copies the current take into ai_interview_attempts, then resets the interview
// so the candidate can take it again with the same link until newExpiry.
func (r *AIInterviewRepository) ArchiveAndReset(ctx context.Context, id, archivedBy uuid.UUID, reason string, newExpiry time.Time) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, ai := range r.memInterviews {
			if ai.ID != id {
				continue
			}
			by := archivedBy
			r.memAttempts = append(r.memAttempts, model.AIInterviewAttempt{
				ID:                uuid.New(),
				AIInterviewID:     ai.ID,
				ApplicantID:       ai.ApplicantID,
				StartedAt:         ai.StartedAt,
				CompletedAt:       ai.CompletedAt,
				Transcript:        append([]model.ChatMessage{}, ai.Transcript...),
				SummaryEvaluation: ai.SummaryEvaluation,
				ScorecardScore:    ai.ScorecardScore,
				RecordingStatus:   ai.RecordingStatus,
				RecordingURL:      ai.RecordingURL,
				Status:            ai.Status,
				Reason:            reason,
				ArchivedBy:        &by,
				ArchivedAt:        time.Now(),
			})
			ai.StartedAt = nil
			ai.CompletedAt = nil
			ai.Transcript = []model.ChatMessage{}
			ai.SummaryEvaluation = nil
			ai.ScorecardScore = 0
			ai.RecordingURL = ""
			ai.RecordingStatus = "pending"
			ai.Status = model.AIInterviewInvited
			ai.InvitationExpiresAt = newExpiry
			ai.RetakeDeadline = &newExpiry
			ai.UpdatedAt = time.Now()
			return nil
		}
		return ErrAIInterviewNotFound
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: begin archive: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		INSERT INTO ai_interview_attempts (
			ai_interview_id, applicant_id, started_at, completed_at, transcript, summary_evaluation,
			scorecard_score, recording_status, recording_url, status, reason, archived_by
		)
		SELECT id, applicant_id, started_at, completed_at, COALESCE(transcript, '[]'::jsonb), summary_evaluation,
			scorecard_score, COALESCE(recording_status, 'pending'), COALESCE(recording_url, ''), status, $2, $3
		FROM ai_interviews WHERE id = $1
	`, id, reason, archivedBy)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: archive attempt: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrAIInterviewNotFound
	}

	if _, err := tx.Exec(ctx, `
		UPDATE ai_interviews
		SET started_at = NULL,
			completed_at = NULL,
			transcript = '[]'::jsonb,
			summary_evaluation = NULL,
			scorecard_score = 0,
			recording_url = '',
			recording_status = 'pending',
			status = 'invited',
			invitation_expires_at = $2,
			expires_at = $2,
			retake_deadline = $2,
			updated_at = now()
		WHERE id = $1
	`, id, newExpiry); err != nil {
		return fmt.Errorf("ai_interview_repo: reset for re-invite: %w", err)
	}
	return tx.Commit(ctx)
}

// ExtendInvitation pushes back the expiry of an interview that has not been started yet.
func (r *AIInterviewRepository) ExtendInvitation(ctx context.Context, id uuid.UUID, newExpiry time.Time) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, ai := range r.memInterviews {
			if ai.ID == id {
				ai.InvitationExpiresAt = newExpiry
				ai.RetakeDeadline = &newExpiry
				ai.UpdatedAt = time.Now()
				return nil
			}
		}
		return ErrAIInterviewNotFound
	}
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_interviews SET invitation_expires_at = $2, expires_at = $2, retake_deadline = $2, updated_at = now() WHERE id = $1`,
		id, newExpiry)
	if err != nil {
		return fmt.Errorf("ai_interview_repo: extend invitation: %w", err)
	}
	return nil
}

// ListAttempts returns an applicant's archived interview takes, newest first.
func (r *AIInterviewRepository) ListAttempts(ctx context.Context, applicantID uuid.UUID) ([]model.AIInterviewAttempt, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.AIInterviewAttempt
		for i := len(r.memAttempts) - 1; i >= 0; i-- {
			if r.memAttempts[i].ApplicantID == applicantID {
				list = append(list, r.memAttempts[i])
			}
		}
		return list, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, ai_interview_id, applicant_id, started_at, completed_at, transcript, summary_evaluation,
			scorecard_score, recording_status, recording_url, status, reason, archived_by, archived_at
		FROM ai_interview_attempts
		WHERE applicant_id = $1
		ORDER BY archived_at DESC
	`, applicantID)
	if err != nil {
		return nil, fmt.Errorf("ai_interview_repo: list attempts: %w", err)
	}
	defer rows.Close()

	var list []model.AIInterviewAttempt
	for rows.Next() {
		var a model.AIInterviewAttempt
		var rawTranscript, rawSummary []byte
		if err := rows.Scan(&a.ID, &a.AIInterviewID, &a.ApplicantID, &a.StartedAt, &a.CompletedAt, &rawTranscript, &rawSummary,
			&a.ScorecardScore, &a.RecordingStatus, &a.RecordingURL, &a.Status, &a.Reason, &a.ArchivedBy, &a.ArchivedAt); err != nil {
			return nil, fmt.Errorf("ai_interview_repo: scan attempt: %w", err)
		}
		_ = json.Unmarshal(rawTranscript, &a.Transcript)
		if len(rawSummary) > 0 {
			var summary model.EvaluationSummary
			if json.Unmarshal(rawSummary, &summary) == nil {
				a.SummaryEvaluation = &summary
			}
		}
		list = append(list, a)
	}
	return list, rows.Err()
}
