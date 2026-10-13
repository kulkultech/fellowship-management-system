-- +goose Up
-- Migration 00023: Fellow Groups, named sets of a program's fellows for targeting sessions and assignments

CREATE TABLE IF NOT EXISTS fellow_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fellow_groups_program_name ON fellow_groups(program_id, LOWER(name));

CREATE TABLE IF NOT EXISTS fellow_group_members (
    group_id UUID NOT NULL REFERENCES fellow_groups(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_fellow_group_members_applicant ON fellow_group_members(applicant_id);

-- +goose Down
DROP TABLE IF EXISTS fellow_group_members;
DROP TABLE IF EXISTS fellow_groups;
