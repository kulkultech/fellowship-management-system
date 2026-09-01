package model

import (
	"time"

	"github.com/google/uuid"
)

type QuestionSet struct {
	ID              uuid.UUID     `json:"id"`
	OrganizationID  *uuid.UUID    `json:"organization_id,omitempty"`
	ProgramID       *uuid.UUID    `json:"program_id,omitempty"`
	Name            string        `json:"name"`
	Description     string        `json:"description,omitempty"`
	Category        string        `json:"category"`
	DurationMinutes int           `json:"duration_minutes"`
	PassingScore    int           `json:"passing_score"`
	Questions       []MCQQuestion `json:"questions"`
	TotalQuestions  int           `json:"total_questions,omitempty"`
	TracksCount     int           `json:"tracks_count,omitempty"`
	AssignedTracks  []string      `json:"assigned_tracks,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}
