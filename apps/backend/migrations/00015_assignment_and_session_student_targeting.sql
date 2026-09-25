-- +goose Up
-- Migration 00015: Add student targeting (target_applicant_ids) to program_assignments and program_sessions

ALTER TABLE program_assignments
ADD COLUMN IF NOT EXISTS target_applicant_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_program_assignments_target_applicants
ON program_assignments USING gin (target_applicant_ids);

ALTER TABLE program_sessions
ADD COLUMN IF NOT EXISTS target_applicant_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_program_sessions_target_applicants
ON program_sessions USING gin (target_applicant_ids);

-- +goose Down
DROP INDEX IF EXISTS idx_program_sessions_target_applicants;
ALTER TABLE program_sessions DROP COLUMN IF EXISTS target_applicant_ids;

DROP INDEX IF EXISTS idx_program_assignments_target_applicants;
ALTER TABLE program_assignments DROP COLUMN IF EXISTS target_applicant_ids;
