-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
CREATE TABLE IF NOT EXISTS program_github_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    owner VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    html_url TEXT NOT NULL DEFAULT '',
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    sync_status VARCHAR(16) NOT NULL DEFAULT 'idle', -- 'idle', 'syncing', 'success', 'error'
    sync_error TEXT NOT NULL DEFAULT '',
    sync_truncated BOOLEAN NOT NULL DEFAULT false,
    sync_started_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    contributions JSONB NOT NULL DEFAULT '{}'::jsonb, -- per-login counts from the last sync
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_github_repos_unique ON program_github_repos(program_id, LOWER(full_name));
CREATE INDEX IF NOT EXISTS idx_program_github_repos_program ON program_github_repos(program_id);

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
DROP TABLE IF EXISTS program_github_repos;
