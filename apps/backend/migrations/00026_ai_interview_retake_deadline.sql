-- +goose Up
-- Migration 00026: Deadline for a re-invited AI interview take (NULL for first invitations)

ALTER TABLE ai_interviews ADD COLUMN IF NOT EXISTS retake_deadline TIMESTAMPTZ;

-- +goose Down
ALTER TABLE ai_interviews DROP COLUMN IF EXISTS retake_deadline;
