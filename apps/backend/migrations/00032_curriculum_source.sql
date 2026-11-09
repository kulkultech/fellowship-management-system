-- +goose Up
-- Migration 00032: Where a program's curriculum was imported from (a Leanpub-style book in a
-- GitHub repository or an uploaded zip), so it can be synced again.

ALTER TABLE program_room_content ADD COLUMN IF NOT EXISTS curriculum_source JSONB;

-- +goose Down
ALTER TABLE program_room_content DROP COLUMN IF EXISTS curriculum_source;
