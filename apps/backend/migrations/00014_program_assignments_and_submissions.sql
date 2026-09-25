-- +goose Up
-- Migration 00014: Add program_assignments and assignment_submissions tables for cohort assignments and grading

CREATE TABLE IF NOT EXISTS program_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL,
    creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TIMESTAMPTZ,
    max_score INT NOT NULL DEFAULT 100,
    attachment_url TEXT NOT NULL DEFAULT '',
    attachment_name TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'published',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_assignments_program ON program_assignments(program_id, due_date);
CREATE INDEX IF NOT EXISTS idx_program_assignments_track ON program_assignments(track_id);
CREATE INDEX IF NOT EXISTS idx_program_assignments_creator ON program_assignments(creator_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES program_assignments(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_size BIGINT NOT NULL DEFAULT 0,
    github_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(32) NOT NULL DEFAULT 'submitted',
    score NUMERIC(5,2),
    feedback TEXT NOT NULL DEFAULT '',
    graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    graded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_assignment_submission UNIQUE (assignment_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_applicant ON assignment_submissions(applicant_id);

-- +goose Down
DROP TABLE IF EXISTS assignment_submissions;
DROP TABLE IF EXISTS program_assignments;
