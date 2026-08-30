-- +goose Up
-- Add status and contact_email to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'approved';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

-- Add assessment pipeline flags and custom AI interview configuration to programs
ALTER TABLE programs ADD COLUMN IF NOT EXISTS enable_mcq BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS enable_ai_interview BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS ai_interview_instructions TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS ai_interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE programs DROP COLUMN IF EXISTS ai_interview_questions;
ALTER TABLE programs DROP COLUMN IF EXISTS ai_interview_instructions;
ALTER TABLE programs DROP COLUMN IF EXISTS enable_ai_interview;
ALTER TABLE programs DROP COLUMN IF EXISTS enable_mcq;

ALTER TABLE organizations DROP COLUMN IF EXISTS contact_email;
ALTER TABLE organizations DROP COLUMN IF EXISTS status;
