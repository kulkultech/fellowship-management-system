package model

import (
	"time"

	"github.com/google/uuid"
)

type ChatMessage struct {
	Role      string    `json:"role"` // "ai" | "candidate" | "system"
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type AIInterviewStatus string

const (
	AIInterviewInvited    AIInterviewStatus = "invited"
	AIInterviewInProgress AIInterviewStatus = "in_progress"
	AIInterviewCompleted  AIInterviewStatus = "completed"
	AIInterviewExpired    AIInterviewStatus = "expired"
)

type EvaluationSummary struct {
	TechnicalAcumen int      `json:"technical_acumen"` // 1-10
	Communication   int      `json:"communication"`    // 1-10
	ProblemSolving  int      `json:"problem_solving"`  // 1-10
	OverallScore    int      `json:"overall_score"`    // 1-100
	KeyStrengths    []string `json:"key_strengths"`
	AreasForGrowth  []string `json:"areas_for_growth"`
	Recommendation  string   `json:"recommendation"` // "Strong Hire", "Hire", "Borderline", "No Hire"
	ExecutiveSummary string  `json:"executive_summary"`
}

type AIInterview struct {
	ID                  uuid.UUID          `json:"id"`
	ApplicantID         uuid.UUID          `json:"applicant_id"`
	ProgramID           uuid.UUID          `json:"program_id"`
	TrackID             *uuid.UUID         `json:"track_id,omitempty"`
	InvitationToken     string             `json:"invitation_token"`
	InvitationExpiresAt time.Time          `json:"invitation_expires_at"`
	StartedAt           *time.Time         `json:"started_at,omitempty"`
	CompletedAt         *time.Time         `json:"completed_at,omitempty"`
	Transcript          []ChatMessage      `json:"transcript"`
	SummaryEvaluation   *EvaluationSummary `json:"summary_evaluation,omitempty"`
	ScorecardScore      int                `json:"scorecard_score"`
	RecordingStatus     string             `json:"recording_status"` // 'pending', 'ready', 'failed'
	RecordingURL        string             `json:"recording_url,omitempty"`
	Status              AIInterviewStatus  `json:"status"`
	CreatedAt           time.Time          `json:"created_at"`
	UpdatedAt           time.Time          `json:"updated_at"`
}
