-- Migration 00017: Open Badges and Certificates
-- +goose Up

CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    badge_type VARCHAR(64) NOT NULL, -- 'member', 'completion'
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    criteria_url TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_badges_applicant_type ON badges(applicant_id, badge_type);
CREATE INDEX IF NOT EXISTS idx_badges_program ON badges(program_id);
CREATE INDEX IF NOT EXISTS idx_badges_org ON badges(organization_id);

CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number VARCHAR(64) UNIQUE NOT NULL,
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_name VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    program_name VARCHAR(255) NOT NULL,
    track_name VARCHAR(255) DEFAULT '',
    issue_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    completion_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(32) NOT NULL DEFAULT 'issued',
    verification_code VARCHAR(128) NOT NULL,
    email_sent_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_applicant_program ON certificates(applicant_id, program_id);
CREATE INDEX IF NOT EXISTS idx_certificates_cert_number ON certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_certificates_program ON certificates(program_id);
CREATE INDEX IF NOT EXISTS idx_certificates_org ON certificates(organization_id);

-- +goose Down
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS badges;
