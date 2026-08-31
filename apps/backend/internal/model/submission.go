package model

import (
	"time"

	"github.com/google/uuid"
)

type CandidateAnswer struct {
	QuestionID       uuid.UUID `json:"question_id"`
	SelectedOptionID string    `json:"selected_option_id"`
	IsCorrect        *bool     `json:"is_correct,omitempty"`
}

type SubmissionStatus string

const (
	SubmissionInProgress SubmissionStatus = "in_progress"
	SubmissionCompleted  SubmissionStatus = "completed"
	SubmissionExpired    SubmissionStatus = "expired"
)

type TestSubmission struct {
	ID               uuid.UUID         `json:"id"`
	ApplicantID      uuid.UUID         `json:"applicant_id"`
	ProgramID        uuid.UUID         `json:"program_id"`
	TrackID          *uuid.UUID        `json:"track_id,omitempty"`
	TestToken        string            `json:"test_token"`
	StartedAt        time.Time         `json:"started_at"`
	SubmittedAt      *time.Time        `json:"submitted_at,omitempty"`
	TimeSpentSeconds int               `json:"time_spent_seconds"`
	TotalScore       int               `json:"total_score"` // Percentage achieved (0-100)
	Passed           bool              `json:"passed"`
	Answers          []CandidateAnswer `json:"answers"`
	Status           SubmissionStatus  `json:"status"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
}
