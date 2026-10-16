package model

import (
	"time"

	"github.com/google/uuid"
)

// SessionFeedbackDirection says who the feedback is for.
type SessionFeedbackDirection string

const (
	// FeedbackToMentor is a fellow's feedback on the session's mentor (instructor).
	FeedbackToMentor SessionFeedbackDirection = "to_mentor"
	// FeedbackToFellow is a mentor's (or admin's) feedback to one fellow.
	FeedbackToFellow SessionFeedbackDirection = "to_fellow"
)

// SessionFeedback is one piece of feedback in a session. ApplicantID is always the fellow:
// the author for FeedbackToMentor, the recipient for FeedbackToFellow.
type SessionFeedback struct {
	ID           uuid.UUID                `json:"id"`
	SessionID    uuid.UUID                `json:"session_id"`
	ProgramID    uuid.UUID                `json:"program_id"`
	Direction    SessionFeedbackDirection `json:"direction"`
	ApplicantID  uuid.UUID                `json:"applicant_id"`
	AuthorUserID *uuid.UUID               `json:"author_user_id,omitempty"`
	AuthorName   string                   `json:"author_name"`
	Rating       *int                     `json:"rating,omitempty"` // 1-5
	Comment      string                   `json:"comment"`
	CreatedAt    time.Time                `json:"created_at"`
	UpdatedAt    time.Time                `json:"updated_at"`
}
