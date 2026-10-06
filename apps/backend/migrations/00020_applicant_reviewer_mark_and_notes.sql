-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS reviewer_mark DOUBLE PRECISION;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS reviewer_notes TEXT;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back
ALTER TABLE applicants DROP COLUMN IF EXISTS reviewer_notes;
ALTER TABLE applicants DROP COLUMN IF EXISTS reviewer_mark;
