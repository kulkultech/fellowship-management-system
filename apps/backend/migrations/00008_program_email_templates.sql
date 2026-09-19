-- 00008_program_email_templates.sql
-- Add email_templates JSONB column to programs table for customizable candidate communications

ALTER TABLE programs ADD COLUMN IF NOT EXISTS email_templates JSONB;
