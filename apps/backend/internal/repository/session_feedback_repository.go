package repository

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kulkul/backend/internal/model"
)

// SessionFeedbackRepository stores two-way session feedback (fellow to mentor, mentor to fellow).
type SessionFeedbackRepository struct {
	pool *pgxpool.Pool
	mu   sync.RWMutex
	mem  map[string]*model.SessionFeedback
}

func NewSessionFeedbackRepository(pool *pgxpool.Pool) *SessionFeedbackRepository {
	return &SessionFeedbackRepository{pool: pool, mem: make(map[string]*model.SessionFeedback)}
}

func feedbackKey(sessionID uuid.UUID, direction model.SessionFeedbackDirection, applicantID uuid.UUID) string {
	return fmt.Sprintf("%s:%s:%s", sessionID, direction, applicantID)
}

// Upsert saves the feedback, replacing any earlier one for the same session, direction and fellow.
func (r *SessionFeedbackRepository) Upsert(ctx context.Context, fb *model.SessionFeedback) (*model.SessionFeedback, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		key := feedbackKey(fb.SessionID, fb.Direction, fb.ApplicantID)
		now := time.Now()
		saved := *fb
		if existing, ok := r.mem[key]; ok {
			saved.ID = existing.ID
			saved.CreatedAt = existing.CreatedAt
		} else {
			saved.ID = uuid.New()
			saved.CreatedAt = now
		}
		saved.UpdatedAt = now
		r.mem[key] = &saved
		out := saved
		return &out, nil
	}

	saved := *fb
	err := r.pool.QueryRow(ctx, `
		INSERT INTO session_feedback (session_id, program_id, direction, applicant_id, author_user_id, author_name, rating, comment)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (session_id, direction, applicant_id) DO UPDATE SET
			author_user_id = EXCLUDED.author_user_id,
			author_name = EXCLUDED.author_name,
			rating = EXCLUDED.rating,
			comment = EXCLUDED.comment,
			updated_at = now()
		RETURNING id, created_at, updated_at
	`, fb.SessionID, fb.ProgramID, string(fb.Direction), fb.ApplicantID, fb.AuthorUserID, fb.AuthorName, fb.Rating, fb.Comment,
	).Scan(&saved.ID, &saved.CreatedAt, &saved.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("session_feedback_repo: upsert: %w", err)
	}
	return &saved, nil
}

// ListBySession returns all feedback of a session, newest first.
func (r *SessionFeedbackRepository) ListBySession(ctx context.Context, sessionID uuid.UUID) ([]model.SessionFeedback, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		list := []model.SessionFeedback{}
		for _, fb := range r.mem {
			if fb.SessionID == sessionID {
				list = append(list, *fb)
			}
		}
		sort.Slice(list, func(i, j int) bool { return list[i].UpdatedAt.After(list[j].UpdatedAt) })
		return list, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, session_id, program_id, direction, applicant_id, author_user_id, author_name, rating, comment, created_at, updated_at
		FROM session_feedback
		WHERE session_id = $1
		ORDER BY updated_at DESC
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session_feedback_repo: list: %w", err)
	}
	defer rows.Close()

	list := []model.SessionFeedback{}
	for rows.Next() {
		var fb model.SessionFeedback
		var direction string
		if err := rows.Scan(&fb.ID, &fb.SessionID, &fb.ProgramID, &direction, &fb.ApplicantID, &fb.AuthorUserID,
			&fb.AuthorName, &fb.Rating, &fb.Comment, &fb.CreatedAt, &fb.UpdatedAt); err != nil {
			return nil, fmt.Errorf("session_feedback_repo: scan: %w", err)
		}
		fb.Direction = model.SessionFeedbackDirection(direction)
		list = append(list, fb)
	}
	return list, rows.Err()
}
