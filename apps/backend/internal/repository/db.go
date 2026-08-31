package repository

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("pgxpool: parse config: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("pgxpool: create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("pgxpool: ping: %w", err)
	}
	return pool, nil
}

// AutoMigrateAndSeed ensures all database tables, columns, indexes, and initial seeds exist on startup.
func AutoMigrateAndSeed(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	if pool == nil {
		return nil
	}

	schema := `
	CREATE TABLE IF NOT EXISTS organizations (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		slug VARCHAR(64) UNIQUE NOT NULL,
		name VARCHAR(255) NOT NULL,
		logo_url TEXT,
		status VARCHAR(32) NOT NULL DEFAULT 'approved',
		contact_email VARCHAR(255),
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);

	ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'approved';
	ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

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
		enable_mcq BOOLEAN NOT NULL DEFAULT true,
		enable_ai_interview BOOLEAN NOT NULL DEFAULT true,
		ai_interview_instructions TEXT,
		ai_interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		CONSTRAINT uq_org_program_slug UNIQUE (organization_id, slug)
	);
	CREATE INDEX IF NOT EXISTS idx_programs_org ON programs(organization_id);

	ALTER TABLE programs ADD COLUMN IF NOT EXISTS enable_mcq BOOLEAN NOT NULL DEFAULT true;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS enable_ai_interview BOOLEAN NOT NULL DEFAULT true;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS ai_interview_instructions TEXT;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS ai_interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb;

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
	`

	if _, err := pool.Exec(ctx, schema); err != nil {
		return fmt.Errorf("automigrate: exec schema: %w", err)
	}
	logger.Info("Database schema verified and migrated successfully")

	// Seed default RSA organization
	var rsaOrgID string
	seedOrgQuery := `
		INSERT INTO organizations (slug, name, logo_url, status, contact_email, created_at, updated_at)
		VALUES ('rsa', 'Remote Skills Academy (RSA)', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=128&h=128&fit=crop', 'approved', 'contact@rsa.org', now(), now())
		ON CONFLICT (slug) DO UPDATE SET updated_at = now()
		RETURNING id::text
	`
	if err := pool.QueryRow(ctx, seedOrgQuery).Scan(&rsaOrgID); err != nil {
		logger.Warn("automigrate: seed org error", slog.Any("error", err))
	}

	// Seed default Admin & Superadmin
	passHash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	seedUsersQuery := `
		INSERT INTO users (organization_id, email, password_hash, name, role, created_at, updated_at)
		VALUES 
			($1::uuid, 'admin@rsa.org', $2, 'RSA Reviewer Admin', 'org_admin', now(), now()),
			(NULL, 'superadmin@fellowhire.com', $2, 'FellowHire SuperAdmin', 'superadmin', now(), now())
		ON CONFLICT (email) DO UPDATE SET updated_at = now()
	`
	if _, err := pool.Exec(ctx, seedUsersQuery, rsaOrgID, string(passHash)); err != nil {
		logger.Warn("automigrate: seed users error", slog.Any("error", err))
	}

	// Seed all LIT 2025/2026 Assessment Programs & MCQ Question Banks into PostgreSQL
	if err := SeedLITAssessmentPrograms(ctx, pool, rsaOrgID, logger); err != nil {
		logger.Warn("automigrate: seed lit programs error", slog.Any("error", err))
	}

	logger.Info("Database auto-migration and initial seed completed")
	return nil
}
