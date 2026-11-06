package repository

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReminderRepository finds sessions and assignments that need a reminder and records which
// reminders went out, so each is sent once even with several servers running.
type ReminderRepository struct {
	pool *pgxpool.Pool
	mu   sync.Mutex
	sent map[string]bool
}

func NewReminderRepository(pool *pgxpool.Pool) *ReminderRepository {
	return &ReminderRepository{pool: pool, sent: map[string]bool{}}
}

// DueItem is a session (by start time) or an assignment (by deadline) coming up.
type DueItem struct {
	ID        uuid.UUID
	DueAt     time.Time
	CreatedAt time.Time
}

// Claim marks a reminder as sent and reports whether this caller is the one to send it.
func (r *ReminderRepository) Claim(ctx context.Context, kind string, itemID uuid.UUID, dueAt time.Time) (bool, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		key := fmt.Sprintf("%s|%s|%d", kind, itemID, dueAt.UTC().Unix())
		if r.sent[key] {
			return false, nil
		}
		r.sent[key] = true
		return true, nil
	}
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO reminders_sent (kind, item_id, due_at) VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, kind, itemID, dueAt)
	if err != nil {
		return false, fmt.Errorf("reminder_repo: claim: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// SessionsStartingBetween lists sessions that start in (from, to] and have not been ended.
func (r *ReminderRepository) SessionsStartingBetween(ctx context.Context, from, to time.Time) ([]DueItem, error) {
	if r.pool == nil {
		return nil, nil
	}
	return r.list(ctx, `
		SELECT id, start_time, created_at FROM program_sessions
		WHERE start_time > $1 AND start_time <= $2 AND ended_at IS NULL
	`, from, to)
}

// AssignmentsDueBetween lists published assignments due in (from, to].
func (r *ReminderRepository) AssignmentsDueBetween(ctx context.Context, from, to time.Time) ([]DueItem, error) {
	if r.pool == nil {
		return nil, nil
	}
	return r.list(ctx, `
		SELECT id, due_date, created_at FROM program_assignments
		WHERE status = 'published' AND due_date IS NOT NULL AND due_date > $1 AND due_date <= $2
	`, from, to)
}

func (r *ReminderRepository) list(ctx context.Context, query string, from, to time.Time) ([]DueItem, error) {
	rows, err := r.pool.Query(ctx, query, from, to)
	if err != nil {
		return nil, fmt.Errorf("reminder_repo: list due: %w", err)
	}
	defer rows.Close()
	var items []DueItem
	for rows.Next() {
		var it DueItem
		if err := rows.Scan(&it.ID, &it.DueAt, &it.CreatedAt); err != nil {
			return nil, fmt.Errorf("reminder_repo: scan due: %w", err)
		}
		items = append(items, it)
	}
	return items, rows.Err()
}
