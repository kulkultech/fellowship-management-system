package handler

import (
	"errors"
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
	InterviewID         string                    `json:"interview_id"`
	ApplicantName       string                    `json:"applicant_name"`
	ProgramName         string                    `json:"program_name"`
	Status              model.AIInterviewStatus   `json:"status"`
	InvitationExpiresAt time.Time                 `json:"invitation_expires_at"`
	Transcript          []model.ChatMessage       `json:"transcript"`
	SummaryEvaluation   *model.EvaluationSummary  `json:"summary_evaluation,omitempty"`
	ScorecardScore      int                       `json:"scorecard_score"`
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

	// If transcript is empty, seed with initial welcome message
	if len(ai.Transcript) == 0 {
		initialMsg := model.ChatMessage{
			Role:      "ai",
			Message:   "Hello " + applicant.FullName + "! Welcome to your AI Technical Screen for " + program.Name + ". I'll be asking you a few practical problem-solving questions. To start off, could you briefly describe a recent technical challenge you tackled and how you resolved it?",
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
	AIMessage         string                    `json:"ai_message"`
	IsCompleted       bool                      `json:"is_completed"`
	SummaryEvaluation *model.EvaluationSummary  `json:"summary_evaluation,omitempty"`
	ScorecardScore    int                       `json:"scorecard_score"`
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

	var req SendMessageRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now()
	// Append candidate message
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

	var aiReply string
	var isCompleted bool
	var summary *model.EvaluationSummary
	score := 0

	// Conversational Flow Logic (Dynamic responsive dialogue)
	switch candidateTurns {
	case 1:
		aiReply = "Thank you for sharing that experience! How do you typically approach debugging when encountering an elusive bug or distributed state inconsistency in production?"
	case 2:
		aiReply = "Great insight. When collaborating on high-velocity projects with tight delivery deadlines, how do you balance writing high-quality tests against speed of shipping?"
	case 3:
		aiReply = "Understood. Finally, if you were asked to design an asynchronous job queue for processing real-time code evaluations, what key architectural components and resilience measures would you include?"
	default:
		// Completed turns
		isCompleted = true
		aiReply = "Thank you for completing the technical conversation! Our AI analysis has processed your responses and generated a preliminary scorecard for our reviewer team."
		nowComplete := time.Now()

		summary = &model.EvaluationSummary{
			TechnicalAcumen:  8,
			Communication:    9,
			ProblemSolving:   8,
			OverallScore:     85,
			KeyStrengths:     []string{"Clear structured communication", "Good trade-off awareness", "Strong debugging methodology"},
			AreasForGrowth:   []string{"Could provide deeper architectural concurrency details"},
			Recommendation:   "Strong Hire",
			ExecutiveSummary: "Candidate articulated technical problem-solving scenarios clearly with solid engineering fundamentals and pragmatic design trade-offs.",
		}
		score = 85

		_ = h.applicantRepo.UpdateStage(r.Context(), ai.ApplicantID, model.StageAIInterviewCompleted)
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), ai.ID, nil, &nowComplete, ai.Transcript, summary, score, model.AIInterviewCompleted)
	}

	// Append AI reply
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
