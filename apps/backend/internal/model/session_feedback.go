package model

import (
	"time"

	"github.com/google/uuid"
)

// SessionFeedbackDirection says who gives feedback to whom.
type SessionFeedbackDirection string

const (
	// FeedbackToMentor is a fellow's feedback on the session's mentor.
	FeedbackToMentor SessionFeedbackDirection = "to_mentor"
	// FeedbackToFellow is a mentor's (or admin's) feedback to one fellow.
	FeedbackToFellow SessionFeedbackDirection = "to_fellow"
	// FeedbackFellowToOrganizer is a fellow's feedback to the program's organizers.
	FeedbackFellowToOrganizer SessionFeedbackDirection = "fellow_to_organizer"
	// FeedbackMentorToOrganizer is a mentor's feedback to the program's organizers.
	FeedbackMentorToOrganizer SessionFeedbackDirection = "mentor_to_organizer"
)

// SessionFeedback is one piece of feedback in a session. ApplicantID is the fellow (author for
// to_mentor and fellow_to_organizer, recipient for to_fellow) and is empty for mentor_to_organizer.
type SessionFeedback struct {
	ID           uuid.UUID                `json:"id"`
	SessionID    uuid.UUID                `json:"session_id"`
	ProgramID    uuid.UUID                `json:"program_id"`
	Direction    SessionFeedbackDirection `json:"direction"`
	ApplicantID  uuid.UUID                `json:"applicant_id,omitempty"`
	AuthorUserID *uuid.UUID               `json:"author_user_id,omitempty"`
	AuthorName   string                   `json:"author_name"`
	Scores       map[string]int           `json:"scores"`           // question key -> 1..5
	Rating       *int                     `json:"rating,omitempty"` // rounded average of the scores
	Comment      string                   `json:"comment"`
	CreatedAt    time.Time                `json:"created_at"`
	UpdatedAt    time.Time                `json:"updated_at"`
}

// SubjectKey identifies whose feedback this is within a session and direction (one per subject).
func (f *SessionFeedback) SubjectKey() string {
	if f.Direction == FeedbackMentorToOrganizer && f.AuthorUserID != nil {
		return f.AuthorUserID.String()
	}
	return f.ApplicantID.String()
}

// FeedbackQuestion is one 1-5 question of a feedback form.
type FeedbackQuestion struct {
	Key      string `json:"key"`
	Label    string `json:"label"`    // short metric name, e.g. "Activeness"
	Question string `json:"question"` // what the rater answers
}

// FeedbackForm is the set of questions for one feedback direction.
type FeedbackForm struct {
	Direction    SessionFeedbackDirection `json:"direction"`
	Title        string                   `json:"title"`
	Questions    []FeedbackQuestion       `json:"questions"`
	CommentLabel string                   `json:"comment_label"`
}

// FeedbackForms are the questions asked in every session.
var FeedbackForms = map[SessionFeedbackDirection]FeedbackForm{
	FeedbackToMentor: {
		Direction: FeedbackToMentor,
		Title:     "Feedback for the mentor",
		Questions: []FeedbackQuestion{
			{Key: "clarity", Label: "Clarity", Question: "How clearly did the mentor explain the material?"},
			{Key: "preparation", Label: "Preparation", Question: "How well prepared was the mentor?"},
			{Key: "engagement", Label: "Engagement", Question: "How well did the mentor involve fellows and answer questions?"},
			{Key: "helpfulness", Label: "Helpfulness", Question: "How useful was this session for your growth?"},
		},
		CommentLabel: "What helped most, and what could the mentor do better?",
	},
	FeedbackFellowToOrganizer: {
		Direction: FeedbackFellowToOrganizer,
		Title:     "Feedback for the organizers",
		Questions: []FeedbackQuestion{
			{Key: "organization", Label: "Organization", Question: "How smoothly was the session run (schedule, links, start time)?"},
			{Key: "communication", Label: "Communication", Question: "How clear was the information you got before the session?"},
			{Key: "materials", Label: "Materials", Question: "How useful were the materials and tools provided?"},
		},
		CommentLabel: "Anything the organizers should improve?",
	},
	FeedbackToFellow: {
		Direction: FeedbackToFellow,
		Title:     "Feedback for the fellow",
		Questions: []FeedbackQuestion{
			{Key: "activeness", Label: "Activeness", Question: "How actively did the fellow participate?"},
			{Key: "understanding", Label: "Understanding", Question: "How well did the fellow understand the material?"},
			{Key: "preparation", Label: "Preparation", Question: "How prepared was the fellow?"},
			{Key: "collaboration", Label: "Collaboration", Question: "How well did the fellow work with others?"},
		},
		CommentLabel: "Notes for the program team (the fellow does not see this)",
	},
	FeedbackMentorToOrganizer: {
		Direction: FeedbackMentorToOrganizer,
		Title:     "Feedback for the organizers",
		Questions: []FeedbackQuestion{
			{Key: "logistics", Label: "Logistics", Question: "How well were scheduling and logistics handled?"},
			{Key: "support", Label: "Support", Question: "How well did the organizers support you as a mentor?"},
			{Key: "fellow_readiness", Label: "Fellow readiness", Question: "How ready were the fellows for this session?"},
		},
		CommentLabel: "Anything the organizers should improve?",
	},
}
