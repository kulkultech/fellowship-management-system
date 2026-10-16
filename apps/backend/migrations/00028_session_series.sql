-- +goose Up
-- Migration 00028: Recurring sessions. Each occurrence stays its own program_sessions row,
-- linked to a series that keeps the repeat rule (RFC 5545 RRULE, as in Google Calendar).

CREATE TABLE IF NOT EXISTS session_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    rrule TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    google_calendar_event_id TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES session_series(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_program_sessions_series ON program_sessions(series_id, start_time);

-- +goose Down
DROP INDEX IF EXISTS idx_program_sessions_series;
ALTER TABLE program_sessions DROP COLUMN IF EXISTS series_id;
DROP TABLE IF EXISTS session_series;
