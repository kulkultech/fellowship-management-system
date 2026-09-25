package model

import (
	"time"

	"github.com/google/uuid"
)

type AssignmentStatus string

const (
	AssignmentStatusPublished AssignmentStatus = "published"
	AssignmentStatusDraft     AssignmentStatus = "draft"
	AssignmentStatusClosed    AssignmentStatus = "closed"
)

type AssignmentSubmissionStatus string

const (
	AssignmentSubmissionSubmitted   AssignmentSubmissionStatus = "submitted"
	AssignmentSubmissionGraded      AssignmentSubmissionStatus = "graded"
	AssignmentSubmissionResubmitted AssignmentSubmissionStatus = "resubmitted"
	AssignmentSubmissionLate        AssignmentSubmissionStatus = "late"
)

type ProgramAssignment struct {
	ID             uuid.UUID        `json:"id"`
	ProgramID      uuid.UUID        `json:"program_id"`
	TrackID        *uuid.UUID       `json:"track_id,omitempty"`
	TrackName      string           `json:"track_name,omitempty"`
	CreatorID      *uuid.UUID       `json:"creator_id,omitempty"`
	CreatorName    string           `json:"creator_name,omitempty"`
	Title          string           `json:"title"`
	Description    string           `json:"description"`
	DueDate        *time.Time       `json:"due_date,omitempty"`
	MaxScore       int              `json:"max_score"`
	AttachmentURL  string           `json:"attachment_url,omitempty"`
	AttachmentName string           `json:"attachment_name,omitempty"`
	Status         AssignmentStatus `json:"status"`
	TargetApplicantIDs []uuid.UUID  `json:"target_applicant_ids"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`

	// Submission stats (computed on queries)
	TotalSubmissions int `json:"total_submissions,omitempty"`
	GradedCount      int `json:"graded_count,omitempty"`
	PendingCount     int `json:"pending_count,omitempty"`

	// Current fellow submission (when queried in fellow/candidate context)
	MySubmission *AssignmentSubmission `json:"my_submission,omitempty"`
}

type AssignmentSubmission struct {
	ID           uuid.UUID                  `json:"id"`
	AssignmentID uuid.UUID                  `json:"assignment_id"`
	ApplicantID  uuid.UUID                  `json:"applicant_id"`
	UserID       *uuid.UUID                 `json:"user_id,omitempty"`
	FileURL      string                     `json:"file_url,omitempty"`
	FileName     string                     `json:"file_name,omitempty"`
	FileSize     int64                      `json:"file_size,omitempty"`
	GithubURL    string                     `json:"github_url,omitempty"`
	Notes        string                     `json:"notes,omitempty"`
	SubmittedAt  time.Time                  `json:"submitted_at"`
	Status       AssignmentSubmissionStatus `json:"status"`
	Score        *float64         `json:"score,omitempty"`
	Feedback     string           `json:"feedback,omitempty"`
	GradedBy     *uuid.UUID       `json:"graded_by,omitempty"`
	GraderName   string           `json:"grader_name,omitempty"`
	GradedAt     *time.Time       `json:"graded_at,omitempty"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`

	// Joined Fellow Info
	FellowName   string `json:"fellow_name,omitempty"`
	FellowEmail  string `json:"fellow_email,omitempty"`
	TrackName    string `json:"track_name,omitempty"`
	University   string `json:"university,omitempty"`
}
