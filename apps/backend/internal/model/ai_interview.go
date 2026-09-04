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

type RubricCriterion struct {
	ID        string `json:"id"`
	Criterion string `json:"criterion"`
	Points    int    `json:"points"`
}

type AIInterviewQuestionItem struct {
	ID                     int               `json:"id"`
	Theme                  string            `json:"theme"`
	Question               string            `json:"question"`
	MaxPoints              int               `json:"max_points"`
	PreparationTimeSeconds int               `json:"preparation_time_seconds,omitempty"`
	ResponseTimeSeconds    int               `json:"response_time_seconds,omitempty"`
	Criteria               []RubricCriterion `json:"criteria"`
}

type AIInterviewRubric struct {
	PreparationTimeSeconds int                       `json:"preparation_time_seconds"` // e.g. 60
	ResponseTimeSeconds    int                       `json:"response_time_seconds"`    // e.g. 90
	AllowRerecord          bool                      `json:"allow_rerecord"`           // e.g. false
	ScoringGuideline       string                    `json:"scoring_guideline"`
	Questions              []AIInterviewQuestionItem `json:"questions"`
}

type CriterionScore struct {
	CriterionID string `json:"criterion_id"`
	Criterion   string `json:"criterion"`
	Score       int    `json:"score"`
	MaxPoints   int    `json:"max_points"`
	Feedback    string `json:"feedback,omitempty"`
}

type QuestionEvaluation struct {
	QuestionID int              `json:"question_id"`
	Theme      string           `json:"theme"`
	Score      int              `json:"score"`
	MaxPoints  int              `json:"max_points"`
	Feedback   string           `json:"feedback,omitempty"`
	Criteria   []CriterionScore `json:"criteria"`
}

type EvaluationSummary struct {
	TechnicalAcumen     int                  `json:"technical_acumen"` // 1-10
	Communication       int                  `json:"communication"`    // 1-10
	ProblemSolving      int                  `json:"problem_solving"`  // 1-10
	OverallScore        int                  `json:"overall_score"`    // 1-100
	KeyStrengths        []string             `json:"key_strengths"`
	AreasForGrowth      []string             `json:"areas_for_growth"`
	Recommendation      string               `json:"recommendation"` // "Strong communication readiness", etc.
	ExecutiveSummary    string               `json:"executive_summary"`
	QuestionEvaluations []QuestionEvaluation `json:"question_evaluations,omitempty"`
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

// DefaultLITRubric returns the exact AI interview questions, timing, criteria, and scoring scale from Workflow.pdf
func DefaultLITRubric() *AIInterviewRubric {
	return &AIInterviewRubric{
		PreparationTimeSeconds: 60,
		ResponseTimeSeconds:    90,
		AllowRerecord:          false,
		ScoringGuideline:       "80-100: Strong communication readiness. 70-79: Suitable, with minor communication-development needs. 60-69: Borderline; review alongside logic-test and application results. Below 60: Communication readiness may not yet meet the internship requirements. Accent fairness: Candidates should not lose marks simply for having an Indonesian accent.",
		Questions: []AIInterviewQuestionItem{
			{
				ID:                     1,
				Theme:                  "Self-introduction and motivation",
				Question:               "Please introduce yourself briefly. What sparked your interest in joining this program, and what do you hope to achieve during the fellowship?",
				MaxPoints:              15,
				PreparationTimeSeconds: 60,
				ResponseTimeSeconds:    90,
				Criteria: []RubricCriterion{
					{ID: "q1_c1", Criterion: "Understands the prompt and gives a relevant response", Points: 4},
					{ID: "q1_c2", Criterion: "Provides a clear, structured introduction (background, interests, strengths)", Points: 5},
					{ID: "q1_c3", Criterion: "Explains why they want to join and what they hope to achieve", Points: 4},
					{ID: "q1_c4", Criterion: "Speaks with reasonable fluency, confidence, and acceptable pronunciation", Points: 2},
				},
			},
			{
				ID:                     2,
				Theme:                  "Learning something difficult",
				Question:               "Tell us about a time when you had to learn something difficult or unfamiliar, whether in your studies, a project, or personal development. How did you approach it, and what was the outcome?",
				MaxPoints:              15,
				PreparationTimeSeconds: 60,
				ResponseTimeSeconds:    90,
				Criteria: []RubricCriterion{
					{ID: "q2_c1", Criterion: "Clearly describes the situation or problem", Points: 4},
					{ID: "q2_c2", Criterion: "Logically explains the steps taken to learn or solve it, and shares the result", Points: 5},
					{ID: "q2_c3", Criterion: "Uses appropriate vocabulary and sentence structure to describe the experience", Points: 3},
					{ID: "q2_c4", Criterion: "Maintains smooth delivery and coherence", Points: 3},
				},
			},
			{
				ID:                     3,
				Theme:                  "Asking a supervisor for clarification",
				Question:               "Imagine you are assigned a task by your supervisor or mentor, but the instructions are unclear, or you realize you do not fully understand the requirements. What would you do, and how would you communicate with your supervisor?",
				MaxPoints:              25,
				PreparationTimeSeconds: 60,
				ResponseTimeSeconds:    90,
				Criteria: []RubricCriterion{
					{ID: "q3_c1", Criterion: "Recognizes the importance of asking for clarification promptly rather than guessing or staying silent", Points: 5},
					{ID: "q3_c2", Criterion: "Explains the problem or confusion clearly", Points: 7},
					{ID: "q3_c3", Criterion: "Demonstrates how they would ask specific, polite questions (e.g. provides a sample phrase or message)", Points: 7},
					{ID: "q3_c4", Criterion: "Uses professional, respectful English suitable for a workplace setting", Points: 4},
					{ID: "q3_c5", Criterion: "Speaks coherently with good flow and confidence", Points: 2},
				},
			},
			{
				ID:                     4,
				Theme:                  "Teamwork and communication challenges",
				Question:               "Describe a situation where you had to work with others (e.g., a university project, an organization, or a competition) and encountered a miscommunication or disagreement. How did you address it, and what did you learn?",
				MaxPoints:              20,
				PreparationTimeSeconds: 60,
				ResponseTimeSeconds:    90,
				Criteria: []RubricCriterion{
					{ID: "q4_c1", Criterion: "Provides a clear and relevant context/example", Points: 4},
					{ID: "q4_c2", Criterion: "Clearly explains their role in the situation", Points: 4},
					{ID: "q4_c3", Criterion: "Explains the communication challenge and the actions taken to address or resolve it constructively", Points: 6},
					{ID: "q4_c4", Criterion: "Reflects on lessons learned", Points: 3},
					{ID: "q4_c5", Criterion: "Speaks clearly, logically, and professionally", Points: 3},
				},
			},
			{
				ID:                     5,
				Theme:                  "Communicating a potential delay",
				Question:               "Suppose you are working on a project deadline for the fellowship, and you realize you might not be able to finish on time. How would you handle this situation, and what would you say to your team or mentor?",
				MaxPoints:              25,
				PreparationTimeSeconds: 60,
				ResponseTimeSeconds:    90,
				Criteria: []RubricCriterion{
					{ID: "q5_c1", Criterion: "Communicates early and proactively rather than waiting until the deadline passes", Points: 6},
					{ID: "q5_c2", Criterion: "States the delay honestly without making excuses", Points: 5},
					{ID: "q5_c3", Criterion: "Proposes a revised deadline, partial deliverable, or solution", Points: 7},
					{ID: "q5_c4", Criterion: "Demonstrates accountability and professionalism", Points: 5},
					{ID: "q5_c5", Criterion: "Speaks clearly, logically, and respectfully in workplace English", Points: 2},
				},
			},
		},
	}
}
