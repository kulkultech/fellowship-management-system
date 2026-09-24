-- +goose Up
-- Migration 00013: Add program_sessions and session_attendances tables for live scheduling and attendance tracking

CREATE TABLE IF NOT EXISTS program_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    session_type VARCHAR(64) NOT NULL DEFAULT 'live_lecture',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    meeting_url TEXT NOT NULL DEFAULT '',
    recording_url TEXT NOT NULL DEFAULT '',
    mentor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_sessions_program ON program_sessions(program_id, start_time);
CREATE INDEX IF NOT EXISTS idx_program_sessions_mentor ON program_sessions(mentor_id);
CREATE INDEX IF NOT EXISTS idx_program_sessions_track ON program_sessions(track_id);

CREATE TABLE IF NOT EXISTS session_attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'absent',
    checked_in_at TIMESTAMPTZ,
    marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_attendance UNIQUE (session_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendances_session ON session_attendances(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendances_applicant ON session_attendances(applicant_id);

-- +goose Down
DROP TABLE IF EXISTS session_attendances;
DROP TABLE IF EXISTS program_sessions;
