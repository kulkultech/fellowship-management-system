-- +goose Up
-- Migration 00022: Track mentor attendance per session (fellows are tracked in session_attendances)

CREATE TABLE IF NOT EXISTS session_mentor_attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'absent',
    notes TEXT NOT NULL DEFAULT '',
    marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_mentor_attendance UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_mentor_attendances_user ON session_mentor_attendances(user_id);

-- +goose Down
DROP TABLE IF EXISTS session_mentor_attendances;
