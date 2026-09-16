-- +goose Up
-- Add email verification and activation token fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_token VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_activation_token ON users(activation_token) WHERE activation_token IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_users_activation_token;
ALTER TABLE users DROP COLUMN IF EXISTS activation_expires_at;
ALTER TABLE users DROP COLUMN IF EXISTS activation_token;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
