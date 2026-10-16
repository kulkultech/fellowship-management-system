-- +goose Up
-- Migration 00029: A mentor marks a session as ended in the workspace, which opens session feedback

ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE program_sessions DROP COLUMN IF EXISTS ended_by;
ALTER TABLE program_sessions DROP COLUMN IF EXISTS ended_at;
