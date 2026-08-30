package model

import (
	"time"

	"github.com/google/uuid"
)

type Program struct {
	ID                       uuid.UUID `json:"id"`
	OrganizationID           uuid.UUID `json:"organization_id"`
	Slug                     string    `json:"slug"`
	Name                     string    `json:"name"`
	Description              string    `json:"description,omitempty"`
	ImageURL                 string    `json:"image_url,omitempty"`
	OpenDate                 time.Time `json:"open_date"`
	EndDate                  time.Time `json:"end_date"`
	EnableMCQ                bool      `json:"enable_mcq"`
	LogicTestDurationMinutes int       `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int       `json:"logic_test_passing_score"` // percentage (e.g. 70)
	AllowRetake              bool      `json:"allow_retake"`
	EnableAIInterview        bool      `json:"enable_ai_interview"`
	AIInterviewInstructions  string    `json:"ai_interview_instructions,omitempty"`
	AIInterviewQuestions     []string  `json:"ai_interview_questions,omitempty"`
	Status                   string    `json:"status"` // 'draft', 'published', 'archived'
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

func (p *Program) IsOpen() bool {
	now := time.Now()
	return now.After(p.OpenDate) && now.Before(p.EndDate)
}
