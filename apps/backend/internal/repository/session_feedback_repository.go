package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kulkul/backend/internal/model"
)

// SessionFeedbackRepository stores session feedback between fellows, mentors and organizers.
type SessionFeedbackRepository struct {
	pool *pgxpool.Pool
	mu   sync.RWMutex
	mem  map[string]*model.SessionFeedback
}

func NewSessionFeedbackRepository(pool *pgxpool.Pool) *SessionFeedbackRepository {
	return &SessionFeedbackRepository{pool: pool, mem: make(map[string]*model.SessionFeedback)}
}

func feedbackKey(fb *model.SessionFeedback) string {
	return fmt.Sprintf("%s:%s:%s", fb.SessionID, fb.Direction, fb.SubjectKey())
}

func copyFeedback(fb *model.SessionFeedback) *model.SessionFeedback {
	out := *fb
	out.Scores = make(map[string]int, len(fb.Scores))
	for k, v := range fb.Scores {
		out.Scores[k] = v
	}
	return &out
}

// Upsert saves the feedback, replacing an earlier one for the same session, direction and subject.
func (r *SessionFeedbackRepository) Upsert(ctx context.Context, fb *model.SessionFeedback) (*model.SessionFeedback, error) {
	if fb.Scores == nil {
		fb.Scores = map[string]int{}
	}
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		key := feedbackKey(fb)
		now := time.Now()
		saved := copyFeedback(fb)
		if existing, ok := r.mem[key]; ok {
			saved.ID = existing.ID
			saved.CreatedAt = existing.CreatedAt
		} else {
			saved.ID = uuid.New()
			saved.CreatedAt = now
		}
		saved.UpdatedAt = now
		r.mem[key] = saved
		return copyFeedback(saved), nil
	}

	scores, _ := json.Marshal(fb.Scores)
	var applicantID *uuid.UUID
	if fb.ApplicantID != uuid.Nil {
		id := fb.ApplicantID
		applicantID = &id
	}
	saved := copyFeedback(fb)
	err := r.pool.QueryRow(ctx, `
		INSERT INTO session_feedback (session_id, program_id, direction, applicant_id, subject_key, author_user_id, author_name, rating, scores, comment)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (session_id, direction, subject_key) DO UPDATE SET
			author_user_id = EXCLUDED.author_user_id,
			author_name = EXCLUDED.author_name,
			rating = EXCLUDED.rating,
			scores = EXCLUDED.scores,
			comment = EXCLUDED.comment,
			updated_at = now()
		RETURNING id, created_at, updated_at
	`, fb.SessionID, fb.ProgramID, string(fb.Direction), applicantID, fb.SubjectKey(), fb.AuthorUserID, fb.AuthorName,
		fb.Rating, scores, fb.Comment,
	).Scan(&saved.ID, &saved.CreatedAt, &saved.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("session_feedback_repo: upsert: %w", err)
	}
	return saved, nil
}

// ListBySession returns all feedback of a session, newest first.
func (r *SessionFeedbackRepository) ListBySession(ctx context.Context, sessionID uuid.UUID) ([]model.SessionFeedback, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		list := []model.SessionFeedback{}
		for _, fb := range r.mem {
			if fb.SessionID == sessionID {
				list = append(list, *copyFeedback(fb))
			}
		}
		sort.Slice(list, func(i, j int) bool { return list[i].UpdatedAt.After(list[j].UpdatedAt) })
		return list, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, session_id, program_id, direction, applicant_id, author_user_id, author_name, rating,
			COALESCE(scores, '{}'::jsonb), comment, created_at, updated_at
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
		var applicantID *uuid.UUID
		var rawScores []byte
		if err := rows.Scan(&fb.ID, &fb.SessionID, &fb.ProgramID, &direction, &applicantID, &fb.AuthorUserID,
			&fb.AuthorName, &fb.Rating, &rawScores, &fb.Comment, &fb.CreatedAt, &fb.UpdatedAt); err != nil {
			return nil, fmt.Errorf("session_feedback_repo: scan: %w", err)
		}
		fb.Direction = model.SessionFeedbackDirection(direction)
		if applicantID != nil {
			fb.ApplicantID = *applicantID
		}
		fb.Scores = map[string]int{}
		_ = json.Unmarshal(rawScores, &fb.Scores)
		list = append(list, fb)
	}
	return list, rows.Err()
}
