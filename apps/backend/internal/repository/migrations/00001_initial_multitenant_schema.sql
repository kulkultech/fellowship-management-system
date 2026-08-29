-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations (e.g. RSA, Kulkul Tech)
CREATE TABLE organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    logo_url   TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizations_slug ON organizations (slug);

-- Platform / Org Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL DEFAULT '',
    role            TEXT NOT NULL DEFAULT 'reviewer',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_org ON users (organization_id);

-- Programs (e.g. LIT 2026 under RSA)
CREATE TABLE programs (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    slug                        TEXT NOT NULL,
    name                        TEXT NOT NULL,
    description                 TEXT NOT NULL DEFAULT '',
    open_date                   TIMESTAMPTZ NOT NULL,
    end_date                    TIMESTAMPTZ NOT NULL,
    logic_test_duration_minutes INT NOT NULL DEFAULT 30,
    logic_test_passing_score    INT NOT NULL DEFAULT 70,
    allow_retake                BOOLEAN NOT NULL DEFAULT false,
    status                      TEXT NOT NULL DEFAULT 'published',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, slug)
);

CREATE INDEX idx_programs_org_slug ON programs (organization_id, slug);

-- Applicants Intake
CREATE TABLE applicants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    program_id      UUID NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    phone           TEXT NOT NULL DEFAULT '',
    github_url      TEXT NOT NULL DEFAULT '',
    linkedin_url    TEXT NOT NULL DEFAULT '',
    resume_url      TEXT NOT NULL DEFAULT '',
    current_stage   TEXT NOT NULL DEFAULT 'registered',
    notes           TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (program_id, email)
);

CREATE INDEX idx_applicants_program ON applicants (program_id);
CREATE INDEX idx_applicants_org ON applicants (organization_id);
CREATE INDEX idx_applicants_stage ON applicants (current_stage);

-- Multiple Choice Questions
CREATE TABLE mcq_questions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id        UUID NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
    category          TEXT NOT NULL DEFAULT 'logic',
    question_text     TEXT NOT NULL,
    options           JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_option_id TEXT NOT NULL,
    explanation       TEXT NOT NULL DEFAULT '',
    points            INT NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcq_program ON mcq_questions (program_id);

-- Timed Test Submissions & Auto-Grading Records
CREATE TABLE test_submissions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id       UUID NOT NULL REFERENCES applicants (id) ON DELETE CASCADE,
    program_id         UUID NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
    test_token         TEXT NOT NULL UNIQUE,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at       TIMESTAMPTZ,
    time_spent_seconds INT NOT NULL DEFAULT 0,
    total_score        INT NOT NULL DEFAULT 0,
    passed             BOOLEAN NOT NULL DEFAULT false,
    answers            JSONB NOT NULL DEFAULT '[]'::jsonb,
    status             TEXT NOT NULL DEFAULT 'in_progress',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_submissions_token ON test_submissions (test_token);
CREATE INDEX idx_test_submissions_applicant ON test_submissions (applicant_id);
CREATE INDEX idx_test_submissions_program ON test_submissions (program_id);

-- AI Interviews & Invitation Links
CREATE TABLE ai_interviews (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id          UUID NOT NULL REFERENCES applicants (id) ON DELETE CASCADE,
    program_id            UUID NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
    invitation_token      TEXT NOT NULL UNIQUE,
    invitation_expires_at TIMESTAMPTZ NOT NULL,
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    transcript            JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary_evaluation    JSONB,
    scorecard_score       INT NOT NULL DEFAULT 0,
    recording_status      TEXT NOT NULL DEFAULT 'pending',
    recording_url         TEXT NOT NULL DEFAULT '',
    status                TEXT NOT NULL DEFAULT 'invited',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_interviews_token ON ai_interviews (invitation_token);
CREATE INDEX idx_ai_interviews_applicant ON ai_interviews (applicant_id);
CREATE INDEX idx_ai_interviews_program ON ai_interviews (program_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS ai_interviews CASCADE;
DROP TABLE IF EXISTS test_submissions CASCADE;
DROP TABLE IF EXISTS mcq_questions CASCADE;
DROP TABLE IF EXISTS applicants CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
-- +goose StatementEnd
