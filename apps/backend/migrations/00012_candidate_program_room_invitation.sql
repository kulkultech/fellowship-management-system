-- +goose Up
-- Add program room invitation tracking columns to applicants
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS program_room_invited_at TIMESTAMPTZ;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS program_room_invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applicants_program_room_invited ON applicants(program_room_invited_at) WHERE program_room_invited_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_applicants_program_room_invited;
ALTER TABLE applicants DROP COLUMN IF EXISTS program_room_invited_by;
ALTER TABLE applicants DROP COLUMN IF EXISTS program_room_invited_at;
