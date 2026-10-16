-- +goose Up
-- Migration 00027: Two-way session feedback (fellow to mentor, mentor to fellow)

CREATE TABLE IF NOT EXISTS session_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('to_mentor', 'to_fellow')),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT '',
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_feedback UNIQUE (session_id, direction, applicant_id)
);
CREATE INDEX IF NOT EXISTS idx_session_feedback_applicant ON session_feedback(applicant_id);

-- +goose Down
DROP TABLE IF EXISTS session_feedback;
