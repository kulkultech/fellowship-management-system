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
		image_url TEXT,
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

	ALTER TABLE programs ADD COLUMN IF NOT EXISTS image_url TEXT;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS enable_mcq BOOLEAN NOT NULL DEFAULT true;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS enable_ai_interview BOOLEAN NOT NULL DEFAULT true;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS ai_interview_instructions TEXT;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS ai_interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb;
	ALTER TABLE programs ADD COLUMN IF NOT EXISTS application_stages JSONB NOT NULL DEFAULT '[]'::jsonb;

	CREATE TABLE IF NOT EXISTS question_sets (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
		program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
		name VARCHAR(255) NOT NULL,
		description TEXT,
		category VARCHAR(64) NOT NULL DEFAULT 'General Logic',
		duration_minutes INT NOT NULL DEFAULT 30,
		passing_score INT NOT NULL DEFAULT 70,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);
	CREATE INDEX IF NOT EXISTS idx_question_sets_org ON question_sets(organization_id);
	CREATE INDEX IF NOT EXISTS idx_question_sets_program ON question_sets(program_id);

	CREATE TABLE IF NOT EXISTS program_tracks (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
		question_set_id UUID REFERENCES question_sets(id) ON DELETE SET NULL,
		slug VARCHAR(64) NOT NULL,
		name VARCHAR(255) NOT NULL,
		description TEXT,
		enable_mcq BOOLEAN NOT NULL DEFAULT true,
		logic_test_duration_minutes INT NOT NULL DEFAULT 35,
		logic_test_passing_score INT NOT NULL DEFAULT 70,
		allow_retake BOOLEAN NOT NULL DEFAULT false,
		enable_ai_interview BOOLEAN NOT NULL DEFAULT true,
		ai_interview_instructions TEXT,
		ai_interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		CONSTRAINT uq_program_track_slug UNIQUE (program_id, slug)
	);
	ALTER TABLE program_tracks ADD COLUMN IF NOT EXISTS question_set_id UUID REFERENCES question_sets(id) ON DELETE SET NULL;
	CREATE INDEX IF NOT EXISTS idx_tracks_program ON program_tracks(program_id);
	CREATE INDEX IF NOT EXISTS idx_tracks_question_set ON program_tracks(question_set_id);

	CREATE TABLE IF NOT EXISTS applicants (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
		program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
		track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL,
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
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL;
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS first_name TEXT;
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS last_name TEXT;
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS university TEXT;
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS major TEXT;
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS semester TEXT;
	ALTER TABLE applicants ADD COLUMN IF NOT EXISTS referral_source TEXT;
	CREATE INDEX IF NOT EXISTS idx_applicants_program ON applicants(program_id);
	CREATE INDEX IF NOT EXISTS idx_applicants_track ON applicants(track_id);
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
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);
	CREATE INDEX IF NOT EXISTS idx_mcq_program ON mcq_questions(program_id);

	ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES program_tracks(id) ON DELETE CASCADE;
	ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS question_set_id UUID REFERENCES question_sets(id) ON DELETE CASCADE;
	ALTER TABLE mcq_questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
	CREATE INDEX IF NOT EXISTS idx_mcq_track ON mcq_questions(track_id);
	CREATE INDEX IF NOT EXISTS idx_mcq_question_set ON mcq_questions(question_set_id);

	CREATE TABLE IF NOT EXISTS test_submissions (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
		program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
		track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL,
		test_token VARCHAR(128) UNIQUE NOT NULL,
		status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
		started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		submitted_at TIMESTAMPTZ,
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

	ALTER TABLE test_submissions ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL;
	ALTER TABLE test_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
	ALTER TABLE test_submissions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
	CREATE INDEX IF NOT EXISTS idx_submissions_track ON test_submissions(track_id);

	CREATE TABLE IF NOT EXISTS ai_interviews (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
		program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
		track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL,
		invite_token VARCHAR(128),
		invitation_token VARCHAR(128),
		status VARCHAR(32) NOT NULL DEFAULT 'invited',
		expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
		invitation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
		started_at TIMESTAMPTZ,
		completed_at TIMESTAMPTZ,
		transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
		summary_evaluation JSONB,
		scorecard_score INT NOT NULL DEFAULT 0,
		recording_status VARCHAR(32) NOT NULL DEFAULT 'pending',
		recording_url TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);
	CREATE INDEX IF NOT EXISTS idx_ai_interviews_token ON ai_interviews(invite_token);
	CREATE INDEX IF NOT EXISTS idx_ai_interviews_applicant ON ai_interviews(applicant_id);

	ALTER TABLE ai_interviews ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES program_tracks(id) ON DELETE SET NULL;
	ALTER TABLE ai_interviews ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(128);
	ALTER TABLE ai_interviews ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days');
	ALTER TABLE ai_interviews ADD COLUMN IF NOT EXISTS recording_status VARCHAR(32) NOT NULL DEFAULT 'pending';
	ALTER TABLE ai_interviews ADD COLUMN IF NOT EXISTS recording_url TEXT;
	CREATE INDEX IF NOT EXISTS idx_ai_interviews_track ON ai_interviews(track_id);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_interviews_invitation_token ON ai_interviews(invitation_token) WHERE invitation_token IS NOT NULL;
	`

	if _, err := pool.Exec(ctx, schema); err != nil {
		return fmt.Errorf("automigrate: exec schema: %w", err)
	}
	logger.Info("Database schema verified and migrated successfully")

	// Seed default RSA organization (without logo)
	var rsaOrgID string
	seedOrgQuery := `
		INSERT INTO organizations (id, slug, name, logo_url, status, contact_email, created_at, updated_at)
		VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'rsa', 'Remote Skills Academy (RSA)', '', 'approved', 'contact@rsa.org', now(), now())
		ON CONFLICT (slug) DO UPDATE SET logo_url = '', updated_at = now()
		RETURNING id::text
	`
	if err := pool.QueryRow(ctx, seedOrgQuery).Scan(&rsaOrgID); err != nil {
		logger.Warn("automigrate: seed org error", slog.Any("error", err))
	}
	_, _ = pool.Exec(ctx, "UPDATE organizations SET logo_url = '' WHERE slug = 'rsa'")

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
