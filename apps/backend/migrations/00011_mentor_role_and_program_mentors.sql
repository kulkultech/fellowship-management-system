-- +goose Up
-- Migration 00011: Add program_mentors table and mentor role support with program assignment in invitations

CREATE TABLE IF NOT EXISTS program_mentors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_title VARCHAR(128) NOT NULL DEFAULT 'Mentor',
    bio TEXT NOT NULL DEFAULT '',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_program_mentor UNIQUE (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_program_mentors_user ON program_mentors(user_id);
CREATE INDEX IF NOT EXISTS idx_program_mentors_program ON program_mentors(program_id);

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_program_id ON invitations(program_id);

-- +goose Down
DROP INDEX IF EXISTS idx_invitations_program_id;
ALTER TABLE invitations DROP COLUMN IF EXISTS program_id;
DROP TABLE IF EXISTS program_mentors;
