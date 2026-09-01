package model

import (
	"time"

	"github.com/google/uuid"
)

type MCQOption struct {
	ID   string `json:"id"`   // e.g. "a", "b", "c", "d"
	Text string `json:"text"` // Option content
}

type MCQQuestion struct {
	ID              uuid.UUID   `json:"id"`
	ProgramID       uuid.UUID   `json:"program_id"`
	TrackID         *uuid.UUID  `json:"track_id,omitempty"`
	QuestionSetID   *uuid.UUID  `json:"question_set_id,omitempty"`
	Category        string      `json:"category"` // 'logic', 'problem_solving', 'coding'
	QuestionText    string      `json:"question_text"`
	Options         []MCQOption `json:"options"`
	CorrectOptionID string      `json:"correct_option_id,omitempty"`
	Explanation     string      `json:"explanation,omitempty"`
	Points          int         `json:"points"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
}

// ClientQuestion strips correct_option_id and explanation before sending to candidate.
type ClientQuestion struct {
	ID           uuid.UUID   `json:"id"`
	Category     string      `json:"category"`
	QuestionText string      `json:"question_text"`
	Options      []MCQOption `json:"options"`
	Points       int         `json:"points"`
}

func (q *MCQQuestion) ToClient() ClientQuestion {
	return ClientQuestion{
		ID:           q.ID,
		Category:     q.Category,
		QuestionText: q.QuestionText,
		Options:      q.Options,
		Points:       q.Points,
	}
}
