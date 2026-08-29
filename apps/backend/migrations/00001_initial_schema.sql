-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Users (Reviewers / Admins)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'org_admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- 3. Programs (Cohorts & Fellowship programs)
CREATE TABLE IF NOT EXISTS programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    slug VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    open_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_date TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '180 days'),
    logic_test_duration_minutes INT NOT NULL DEFAULT 30,
    logic_test_passing_score INT NOT NULL DEFAULT 70,
    allow_retake BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(32) NOT NULL DEFAULT 'published',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_org_program_slug UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_programs_org ON programs(organization_id);

-- 4. Applicants (Candidate intake)
CREATE TABLE IF NOT EXISTS applicants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(64),
    github_url TEXT,
    linkedin_url TEXT,
    resume_url TEXT,
    current_stage VARCHAR(64) NOT NULL DEFAULT 'applied',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_program_applicant_email UNIQUE (program_id, email)
);
CREATE INDEX IF NOT EXISTS idx_applicants_program ON applicants(program_id);
CREATE INDEX IF NOT EXISTS idx_applicants_stage ON applicants(current_stage);

-- 5. MCQ Questions & Test Bank
CREATE TABLE IF NOT EXISTS mcq_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_option_id VARCHAR(16) NOT NULL,
    explanation TEXT,
    points INT NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcq_program ON mcq_questions(program_id);

-- 6. Test Submissions
CREATE TABLE IF NOT EXISTS test_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    test_token VARCHAR(128) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    answers JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_score INT NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT false,
    time_spent_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_submissions_token ON test_submissions(test_token);
CREATE INDEX IF NOT EXISTS idx_submissions_applicant ON test_submissions(applicant_id);

-- 7. AI Interviews & Screening
CREATE TABLE IF NOT EXISTS ai_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    invite_token VARCHAR(128) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'invited',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary_evaluation JSONB,
    scorecard_score INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_interviews_token ON ai_interviews(invite_token);
CREATE INDEX IF NOT EXISTS idx_ai_interviews_applicant ON ai_interviews(applicant_id);

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
DROP TABLE IF EXISTS ai_interviews;
DROP TABLE IF EXISTS test_submissions;
DROP TABLE IF EXISTS mcq_questions;
DROP TABLE IF EXISTS applicants;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;
