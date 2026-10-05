-- Migration 00018: Add google_calendar_event_id and google_calendar_html_link to program_sessions
ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS google_calendar_event_id VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS google_calendar_html_link TEXT NOT NULL DEFAULT '';
