-- +goose Up
ALTER TABLE programs ADD COLUMN IF NOT EXISTS candidate_flow JSONB NOT NULL DEFAULT '["fill_form", "mcq_test", "ai_interview"]'::jsonb;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS form_submitted BOOLEAN NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE applicants DROP COLUMN IF EXISTS form_submitted;
ALTER TABLE programs DROP COLUMN IF EXISTS candidate_flow;
