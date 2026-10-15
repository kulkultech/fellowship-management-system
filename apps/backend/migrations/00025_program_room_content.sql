-- +goose Up
-- Migration 00025: Curriculum and resources shown in each program room (editable by admins and mentors)

CREATE TABLE IF NOT EXISTS program_room_content (
    program_id UUID PRIMARY KEY REFERENCES programs(id) ON DELETE CASCADE,
    curriculum JSONB NOT NULL DEFAULT '[]'::jsonb,
    resources JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS program_room_content;
