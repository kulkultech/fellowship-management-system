-- +goose Up
-- Migration 00024: Keep previous AI interview takes when an admin re-invites a candidate

CREATE TABLE IF NOT EXISTS ai_interview_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_interview_id UUID NOT NULL REFERENCES ai_interviews(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary_evaluation JSONB,
    scorecard_score INT NOT NULL DEFAULT 0,
    recording_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    recording_url TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    reason TEXT NOT NULL DEFAULT '',
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_interview_attempts_applicant ON ai_interview_attempts(applicant_id, archived_at DESC);

-- +goose Down
DROP TABLE IF EXISTS ai_interview_attempts;
