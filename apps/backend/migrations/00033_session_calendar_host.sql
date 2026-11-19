-- +goose Up
-- Migration 00033: The Google account that owns each session's Calendar event and Meet room.
-- The session's @domain mentor hosts it, so their joining starts Meet auto-recording;
-- '' means the default account (GOOGLE_CALENDAR_IMPERSONATE).

ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS google_calendar_host VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE session_series ADD COLUMN IF NOT EXISTS google_calendar_host VARCHAR(255) NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE session_series DROP COLUMN IF EXISTS google_calendar_host;
ALTER TABLE program_sessions DROP COLUMN IF EXISTS google_calendar_host;
