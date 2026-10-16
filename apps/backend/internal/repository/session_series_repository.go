package repository

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/recurrence"
)

var ErrSeriesNotFound = errors.New("session series not found")

// SeriesLocation returns the series time zone, falling back to Jakarta time.
func SeriesLocation(name string) *time.Location {
	if name != "" {
		if loc, err := time.LoadLocation(name); err == nil {
			return loc
		}
	}
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		return loc
	}
	return time.FixedZone("WIB", 7*3600)
}

// describeRecurrence fills the human summary of a recurring session's repeat rule.
func describeRecurrence(s *model.ProgramSession) {
	if s.RecurrenceRule == "" {
		return
	}
	if rule, err := recurrence.Parse(s.RecurrenceRule); err == nil {
		s.RecurrenceDescription = recurrence.Describe(rule, s.StartTime.In(SeriesLocation(s.RecurrenceTimezone)))
	}
}

// fillMemSeries copies the series rule onto an in-memory session (caller holds the lock).
func (r *SessionRepository) fillMemSeries(s *model.ProgramSession) {
	s.RecurrenceRule, s.RecurrenceTimezone, s.RecurrenceDescription = "", "", ""
	if s.SeriesID == nil {
		return
	}
	if series, ok := r.memSeries[*s.SeriesID]; ok {
		s.RecurrenceRule = series.RRule
		s.RecurrenceTimezone = series.Timezone
		describeRecurrence(s)
	}
}

func (r *SessionRepository) CreateSeries(ctx context.Context, series *model.SessionSeries) (*model.SessionSeries, error) {
	if series.ID == uuid.Nil {
		series.ID = uuid.New()
	}
	now := time.Now()
	series.CreatedAt, series.UpdatedAt = now, now
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		cp := *series
		r.memSeries[cp.ID] = &cp
		return &cp, nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO session_series (id, program_id, rrule, timezone, google_calendar_event_id, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, series.ID, series.ProgramID, series.RRule, series.Timezone, series.GoogleCalendarEventID, series.CreatedBy, series.CreatedAt, series.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("session_repo: create series: %w", err)
	}
	return series, nil
}

func (r *SessionRepository) GetSeries(ctx context.Context, id uuid.UUID) (*model.SessionSeries, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		s, ok := r.memSeries[id]
		if !ok {
			return nil, ErrSeriesNotFound
		}
		cp := *s
		return &cp, nil
	}
	var s model.SessionSeries
	err := r.pool.QueryRow(ctx, `
		SELECT id, program_id, rrule, timezone, google_calendar_event_id, created_by, created_at, updated_at
		FROM session_series WHERE id = $1
	`, id).Scan(&s.ID, &s.ProgramID, &s.RRule, &s.Timezone, &s.GoogleCalendarEventID, &s.CreatedBy, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSeriesNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("session_repo: get series: %w", err)
	}
	return &s, nil
}

// UpdateSeriesRule replaces a series' repeat rule.
func (r *SessionRepository) UpdateSeriesRule(ctx context.Context, id uuid.UUID, rrule string) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		s, ok := r.memSeries[id]
		if !ok {
			return ErrSeriesNotFound
		}
		s.RRule = rrule
		s.UpdatedAt = time.Now()
		return nil
	}
	_, err := r.pool.Exec(ctx, `UPDATE session_series SET rrule = $2, updated_at = now() WHERE id = $1`, id, rrule)
	if err != nil {
		return fmt.Errorf("session_repo: update series rule: %w", err)
	}
	return nil
}

// DeleteSeries removes the series record; its sessions (if any remain) become single sessions.
func (r *SessionRepository) DeleteSeries(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		delete(r.memSeries, id)
		for _, s := range r.memSessions {
			if s.SeriesID != nil && *s.SeriesID == id {
				s.SeriesID = nil
			}
		}
		return nil
	}
	if _, err := r.pool.Exec(ctx, `DELETE FROM session_series WHERE id = $1`, id); err != nil {
		return fmt.Errorf("session_repo: delete series: %w", err)
	}
	return nil
}

// ListSeriesSessions returns a series' sessions in start order.
func (r *SessionRepository) ListSeriesSessions(ctx context.Context, seriesID uuid.UUID) ([]model.ProgramSession, error) {
	var ids []uuid.UUID
	if r.pool == nil {
		r.mu.RLock()
		type idStart struct {
			id    uuid.UUID
			start time.Time
		}
		var found []idStart
		for _, s := range r.memSessions {
			if s.SeriesID != nil && *s.SeriesID == seriesID {
				found = append(found, idStart{s.ID, s.StartTime})
			}
		}
		r.mu.RUnlock()
		sort.Slice(found, func(i, j int) bool { return found[i].start.Before(found[j].start) })
		for _, f := range found {
			ids = append(ids, f.id)
		}
	} else {
		rows, err := r.pool.Query(ctx, `SELECT id FROM program_sessions WHERE series_id = $1 ORDER BY start_time ASC`, seriesID)
		if err != nil {
			return nil, fmt.Errorf("session_repo: list series sessions: %w", err)
		}
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, fmt.Errorf("session_repo: scan series session: %w", err)
			}
			ids = append(ids, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	list := make([]model.ProgramSession, 0, len(ids))
	for _, id := range ids {
		s, err := r.GetSessionByID(ctx, id)
		if err != nil {
			return nil, err
		}
		list = append(list, *s)
	}
	return list, nil
}
