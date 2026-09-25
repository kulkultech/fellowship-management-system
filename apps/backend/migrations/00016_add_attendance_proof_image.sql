-- Migration 00016: Add proof_image_url to session_attendances for candidate attendance validation
-- +goose Up
ALTER TABLE session_attendances 
    ADD COLUMN IF NOT EXISTS proof_image_url TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE session_attendances 
    DROP COLUMN IF EXISTS proof_image_url;
