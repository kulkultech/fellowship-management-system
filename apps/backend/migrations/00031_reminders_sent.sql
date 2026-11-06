-- +goose Up
-- Migration 00031: Session and assignment reminder emails already sent, so each goes out once.
-- due_at is part of the key: moving a session or deadline sends the reminder again for the new time.

CREATE TABLE IF NOT EXISTS reminders_sent (
    kind    VARCHAR(40) NOT NULL,
    item_id UUID NOT NULL,
    due_at  TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, item_id, due_at)
);

-- +goose Down
DROP TABLE IF EXISTS reminders_sent;
