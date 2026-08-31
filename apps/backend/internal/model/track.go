package model

import (
	"time"

	"github.com/google/uuid"
)

type Track struct {
	ID                       uuid.UUID `json:"id"`
	ProgramID                uuid.UUID `json:"program_id"`
	Slug                     string    `json:"slug"`
	Name                     string    `json:"name"`
	Description              string    `json:"description,omitempty"`
	EnableMCQ                bool      `json:"enable_mcq"`
	LogicTestDurationMinutes int       `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int       `json:"logic_test_passing_score"` // percentage (e.g. 70)
	AllowRetake              bool      `json:"allow_retake"`
	EnableAIInterview        bool      `json:"enable_ai_interview"`
	AIInterviewInstructions  string    `json:"ai_interview_instructions,omitempty"`
	AIInterviewQuestions     []string  `json:"ai_interview_questions,omitempty"`
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}
