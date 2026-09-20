-- 00009_applicant_soft_delete.sql
-- Add soft-delete (deleted_at) support for applicants and convert uniqueness to active-only partial index

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_applicants_deleted_at ON applicants(deleted_at);

-- Replace strict unique constraint with partial unique index so archived applicants can re-apply
ALTER TABLE applicants DROP CONSTRAINT IF EXISTS uq_program_applicant_email;
CREATE UNIQUE INDEX IF NOT EXISTS uq_program_applicant_active_email ON applicants(program_id, email) WHERE deleted_at IS NULL;
