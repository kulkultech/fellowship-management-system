-- +goose Up
ALTER TABLE programs ADD COLUMN IF NOT EXISTS application_form_schema JSONB;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS custom_responses JSONB NOT NULL DEFAULT '{}'::jsonb;

-- +goose Down
ALTER TABLE applicants DROP COLUMN IF EXISTS custom_responses;
ALTER TABLE programs DROP COLUMN IF EXISTS application_form_schema;
