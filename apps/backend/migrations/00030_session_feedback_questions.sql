-- +goose Up
-- Migration 00030: Feedback questions (per-question 1-5 scores) and feedback to the organizers.
-- subject_key is the fellow (applicant) or, for a mentor's feedback to the organizers, the mentor (user).

ALTER TABLE session_feedback ALTER COLUMN direction TYPE VARCHAR(32);
ALTER TABLE session_feedback ADD COLUMN IF NOT EXISTS scores JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE session_feedback ADD COLUMN IF NOT EXISTS subject_key TEXT;
UPDATE session_feedback SET subject_key = applicant_id::text WHERE subject_key IS NULL;
ALTER TABLE session_feedback ALTER COLUMN subject_key SET NOT NULL;
ALTER TABLE session_feedback ALTER COLUMN applicant_id DROP NOT NULL;
ALTER TABLE session_feedback DROP CONSTRAINT IF EXISTS uq_session_feedback;
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_feedback_subject ON session_feedback(session_id, direction, subject_key);
ALTER TABLE session_feedback DROP CONSTRAINT IF EXISTS session_feedback_direction_check;
ALTER TABLE session_feedback ADD CONSTRAINT session_feedback_direction_check
    CHECK (direction IN ('to_mentor', 'to_fellow', 'fellow_to_organizer', 'mentor_to_organizer'));

-- +goose Down
DELETE FROM session_feedback WHERE direction IN ('fellow_to_organizer', 'mentor_to_organizer');
ALTER TABLE session_feedback DROP CONSTRAINT IF EXISTS session_feedback_direction_check;
ALTER TABLE session_feedback ADD CONSTRAINT session_feedback_direction_check CHECK (direction IN ('to_mentor', 'to_fellow'));
DROP INDEX IF EXISTS uq_session_feedback_subject;
ALTER TABLE session_feedback ALTER COLUMN applicant_id SET NOT NULL;
ALTER TABLE session_feedback ADD CONSTRAINT uq_session_feedback UNIQUE (session_id, direction, applicant_id);
ALTER TABLE session_feedback DROP COLUMN IF EXISTS subject_key;
ALTER TABLE session_feedback DROP COLUMN IF EXISTS scores;
