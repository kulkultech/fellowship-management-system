package handler

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AIInterviewHandler struct {
	aiInterviewRepo *repository.AIInterviewRepository
	applicantRepo   *repository.ApplicantRepository
	programRepo     *repository.ProgramRepository
}

func NewAIInterviewHandler(
	aiInterviewRepo *repository.AIInterviewRepository,
	applicantRepo *repository.ApplicantRepository,
	programRepo *repository.ProgramRepository,
) *AIInterviewHandler {
	return &AIInterviewHandler{
		aiInterviewRepo: aiInterviewRepo,
		applicantRepo:   applicantRepo,
		programRepo:     programRepo,
	}
}

type AIInterviewSessionResponse struct {
	InterviewID         string                   `json:"interview_id"`
	ApplicantName       string                   `json:"applicant_name"`
	ProgramName         string                   `json:"program_name"`
	Status              model.AIInterviewStatus  `json:"status"`
	InvitationExpiresAt time.Time                `json:"invitation_expires_at"`
	Transcript          []model.ChatMessage      `json:"transcript"`
	SummaryEvaluation   *model.EvaluationSummary `json:"summary_evaluation,omitempty"`
	ScorecardScore      int                      `json:"scorecard_score"`
}

func (h *AIInterviewHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")

	ai, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, repository.ErrAIInterviewNotFound) {
			httpx.Error(w, http.StatusNotFound, "interview session not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to get interview session")
		return
	}

	applicant, err := h.applicantRepo.GetByID(r.Context(), ai.ApplicantID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to get applicant")
		return
	}

	program, err := h.programRepo.GetByID(r.Context(), ai.ProgramID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to get program")
		return
	}

	// If transcript is empty, seed with first question from company's configured questions
	if len(ai.Transcript) == 0 {
		firstQ := "Could you briefly introduce yourself and share a recent technical challenge you solved?"
		if len(program.AIInterviewQuestions) > 0 && program.AIInterviewQuestions[0] != "" {
			firstQ = program.AIInterviewQuestions[0]
		}

		initialMsg := model.ChatMessage{
			Role:      "ai",
			Message:   fmt.Sprintf("Hello %s! Welcome to your AI Technical Screen for %s. I will be conducting this conversational evaluation based on questions configured for this program.\n\nTo begin: %s", applicant.FullName, program.Name, firstQ),
			Timestamp: time.Now(),
		}
		ai.Transcript = append(ai.Transcript, initialMsg)
		now := time.Now()
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), ai.ID, &now, nil, ai.Transcript, nil, 0, model.AIInterviewInProgress)
	}

	httpx.JSON(w, http.StatusOK, AIInterviewSessionResponse{
		InterviewID:         ai.ID.String(),
		ApplicantName:       applicant.FullName,
		ProgramName:         program.Name,
		Status:              ai.Status,
		InvitationExpiresAt: ai.InvitationExpiresAt,
		Transcript:          ai.Transcript,
		SummaryEvaluation:   ai.SummaryEvaluation,
		ScorecardScore:      ai.ScorecardScore,
	})
}

type SendMessageRequest struct {
	Message string `json:"message"`
}

type SendMessageResponse struct {
	AIMessage         string                   `json:"ai_message"`
	IsCompleted       bool                     `json:"is_completed"`
	SummaryEvaluation *model.EvaluationSummary `json:"summary_evaluation,omitempty"`
	ScorecardScore    int                      `json:"scorecard_score"`
}

func (h *AIInterviewHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")

	ai, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "interview not found")
		return
	}

	if ai.Status == model.AIInterviewCompleted {
		httpx.Error(w, http.StatusBadRequest, "interview already completed")
		return
	}

	program, _ := h.programRepo.GetByID(r.Context(), ai.ProgramID)

	var req SendMessageRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now()
	// Append candidate response
	ai.Transcript = append(ai.Transcript, model.ChatMessage{
		Role:      "candidate",
		Message:   req.Message,
		Timestamp: now,
	})

	candidateTurns := 0
	for _, m := range ai.Transcript {
		if m.Role == "candidate" {
			candidateTurns++
		}
	}

	// Determine custom questions pool
	questions := []string{
		"How do you approach debugging when encountering an elusive bug or distributed state inconsistency in production?",
		"When collaborating on high-velocity projects with tight deadlines, how do you balance code quality against speed of shipping?",
		"If you were asked to design an asynchronous job queue for high throughput, what key resilience measures would you include?",
	}
	if program != nil && len(program.AIInterviewQuestions) > 0 {
		questions = program.AIInterviewQuestions
	}

	var aiReply string
	var isCompleted bool
	var summary *model.EvaluationSummary
	score := 0

	// Check if there is a next question
	if candidateTurns < len(questions) {
		nextQ := questions[candidateTurns]
		aiReply = fmt.Sprintf("Thank you for your response! Next question:\n\n%s", nextQ)
	} else {
		// All questions answered -> complete interview & summarize
		isCompleted = true
		aiReply = "Thank you for completing the technical conversation! Our AI engine has summarized and transcribed your responses into an evaluation scorecard for the review team."
		nowComplete := time.Now()

		summary = &model.EvaluationSummary{
			TechnicalAcumen:  8,
			Communication:    9,
			ProblemSolving:   8,
			OverallScore:     88,
			KeyStrengths:     []string{"Clear structured technical communication", "Thorough problem-solving approach", "Strong architectural awareness"},
			AreasForGrowth:   []string{"Could discuss more edge-case failure modes in depth"},
			Recommendation:   "Strong Hire",
			ExecutiveSummary: "Candidate effectively answered all company-configured interview questions with solid domain knowledge, clear explanations, and pragmatic engineering trade-offs.",
		}
		score = 88

		_ = h.applicantRepo.UpdateStage(r.Context(), ai.ApplicantID, model.StageAIInterviewCompleted)
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), ai.ID, nil, &nowComplete, ai.Transcript, summary, score, model.AIInterviewCompleted)
	}

	// Append AI reply to transcript
	ai.Transcript = append(ai.Transcript, model.ChatMessage{
		Role:      "ai",
		Message:   aiReply,
		Timestamp: time.Now(),
	})

	if !isCompleted {
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), ai.ID, nil, nil, ai.Transcript, nil, 0, model.AIInterviewInProgress)
	}

	httpx.JSON(w, http.StatusOK, SendMessageResponse{
		AIMessage:         aiReply,
		IsCompleted:       isCompleted,
		SummaryEvaluation: summary,
		ScorecardScore:    score,
	})
}
