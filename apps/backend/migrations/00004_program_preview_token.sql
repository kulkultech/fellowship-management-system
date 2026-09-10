-- +goose Up
ALTER TABLE programs ADD COLUMN IF NOT EXISTS preview_token UUID NOT NULL DEFAULT gen_random_uuid();

-- +goose Down
ALTER TABLE programs DROP COLUMN IF EXISTS preview_token;
