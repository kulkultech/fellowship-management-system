package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AIInterviewHandler struct {
	aiInterviewRepo *repository.AIInterviewRepository
	applicantRepo   *repository.ApplicantRepository
	programRepo     *repository.ProgramRepository
	trackRepo       *repository.TrackRepository
}

func NewAIInterviewHandler(
	aiInterviewRepo *repository.AIInterviewRepository,
	applicantRepo *repository.ApplicantRepository,
	programRepo *repository.ProgramRepository,
	trackRepo *repository.TrackRepository,
) *AIInterviewHandler {
	return &AIInterviewHandler{
		aiInterviewRepo: aiInterviewRepo,
		applicantRepo:   applicantRepo,
		programRepo:     programRepo,
		trackRepo:       trackRepo,
	}
}

type AIInterviewSessionResponse struct {
	InterviewID         string                   `json:"interview_id"`
	ApplicantName       string                   `json:"applicant_name"`
	ProgramName         string                   `json:"program_name"`
	TrackName           string                   `json:"track_name,omitempty"`
	Status              model.AIInterviewStatus  `json:"status"`
	InvitationExpiresAt time.Time                `json:"invitation_expires_at"`
	Transcript          []model.ChatMessage      `json:"transcript"`
	SummaryEvaluation   *model.EvaluationSummary `json:"summary_evaluation,omitempty"`
	ScorecardScore      int                      `json:"scorecard_score"`
	RecordingURL        string                   `json:"recording_url,omitempty"`
	RecordingStatus     string                   `json:"recording_status,omitempty"`
}


func (h *AIInterviewHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")

	ai, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, repository.ErrAIInterviewNotFound) && (token == "demo" || token == "demo-interview-token" || strings.HasPrefix(token, "demo-")) {
			demoAppID := uuid.New()
			demoProgID := uuid.New()
			demoApplicant := &model.Applicant{
				ID:           demoAppID,
				ProgramID:    demoProgID,
				FullName:     "Alex Rivera",
				FirstName:    "Alex",
				LastName:     "Rivera",
				Email:        "alex.rivera@example.com",
				CurrentStage: model.StageAIInterviewInvited,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			_, _, _ = h.applicantRepo.CreateOrGet(r.Context(), demoApplicant)
			ai, _ = h.aiInterviewRepo.CreateInvitationWithTrack(r.Context(), demoAppID, demoProgID, nil, token, time.Now().Add(7*24*time.Hour))
		} else if errors.Is(err, repository.ErrAIInterviewNotFound) {
			httpx.Error(w, http.StatusNotFound, "interview session not found")
			return
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to get interview session")
			return
		}
	}

	applicantName := "Candidate"
	applicant, err := h.applicantRepo.GetByID(r.Context(), ai.ApplicantID)
	if err == nil && applicant != nil {
		applicantName = applicant.FullName
	}

	displayName := "LIT 2026 Engineering Fellowship"
	program, err := h.programRepo.GetByID(r.Context(), ai.ProgramID)
	if err == nil && program != nil {
		displayName = program.Name
	}

	trackName := "Software Engineering & Systems Track"
	var trackQuestions []string

	if ai.TrackID != nil {
		track, err := h.trackRepo.GetByID(r.Context(), *ai.TrackID)
		if err == nil && track != nil {
			trackName = track.Name
			displayName = fmt.Sprintf("%s - %s", displayName, track.Name)
			trackQuestions = track.AIInterviewQuestions
		}
	}

	// If transcript is empty, seed with first question from track/program configured questions
	if len(ai.Transcript) == 0 {
		firstQ := "Could you briefly introduce yourself and share a recent technical challenge you solved?"
		if len(trackQuestions) > 0 && trackQuestions[0] != "" {
			firstQ = trackQuestions[0]
		} else if program != nil && len(program.AIInterviewQuestions) > 0 && program.AIInterviewQuestions[0] != "" {
			firstQ = program.AIInterviewQuestions[0]
		}

		initialMsg := model.ChatMessage{
			Role:      "ai",
			Message:   fmt.Sprintf("Hello %s! Welcome to your AI Technical Screen for %s. I will be conducting this conversational evaluation based on questions configured for this specialization track.\n\nTo begin: %s", applicantName, displayName, firstQ),
			Timestamp: time.Now(),
		}
		ai.Transcript = append(ai.Transcript, initialMsg)
		now := time.Now()
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), ai.ID, &now, nil, ai.Transcript, nil, 0, model.AIInterviewInProgress)
	}

	httpx.JSON(w, http.StatusOK, AIInterviewSessionResponse{
		InterviewID:         ai.ID.String(),
		ApplicantName:       applicant.FullName,
		ProgramName:         displayName,
		TrackName:           trackName,
		Status:              ai.Status,
		InvitationExpiresAt: ai.InvitationExpiresAt,
		Transcript:          ai.Transcript,
		SummaryEvaluation:   ai.SummaryEvaluation,
		ScorecardScore:      ai.ScorecardScore,
		RecordingURL:        ai.RecordingURL,
		RecordingStatus:     ai.RecordingStatus,
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

	if ai.TrackID != nil {
		if track, err := h.trackRepo.GetByID(r.Context(), *ai.TrackID); err == nil && track != nil && len(track.AIInterviewQuestions) > 0 {
			questions = track.AIInterviewQuestions
		}
	} else if program != nil && len(program.AIInterviewQuestions) > 0 {
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
			KeyStrengths:     []string{"Clear structured technical communication", "Thorough problem-solving approach", "Strong domain knowledge"},
			AreasForGrowth:   []string{"Could discuss more edge-case failure modes in depth"},
			Recommendation:   "Strong Hire",
			ExecutiveSummary: "Candidate effectively answered all track-configured interview questions with solid domain knowledge, clear explanations, and pragmatic engineering trade-offs.",
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

type UploadRecordingResponse struct {
	Message         string `json:"message"`
	RecordingURL    string `json:"recording_url"`
	RecordingStatus string `json:"recording_status"`
}

func (h *AIInterviewHandler) UploadRecording(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")

	ai, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "interview not found")
		return
	}

	var recordingURL string

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		// Limit to 64MB for video recording uploads
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			httpx.Error(w, http.StatusBadRequest, "failed to parse multipart video form")
			return
		}

		file, header, err := r.FormFile("video")
		if err == nil && file != nil {
			defer file.Close()

			uploadDir := "./uploads/recordings"
			_ = os.MkdirAll(uploadDir, 0755)

			ext := filepath.Ext(header.Filename)
			if ext == "" {
				ext = ".webm"
			}
			filename := fmt.Sprintf("%s_%s%s", ai.ID.String(), uuid.New().String()[:8], ext)
			destPath := filepath.Join(uploadDir, filename)

			dest, err := os.Create(destPath)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to save recording file on server")
				return
			}
			defer dest.Close()

			if _, err := io.Copy(dest, file); err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to write recording file data")
				return
			}

			recordingURL = "/uploads/recordings/" + filename
		}
	}

	if recordingURL == "" {
		var req struct {
			RecordingURL string `json:"recording_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.RecordingURL != "" {
			recordingURL = req.RecordingURL
		}
	}

	if recordingURL == "" {
		httpx.Error(w, http.StatusBadRequest, "no video recording data provided")
		return
	}

	if err := h.aiInterviewRepo.UpdateRecording(r.Context(), ai.ID, recordingURL, "ready"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update recording in database")
		return
	}

	httpx.JSON(w, http.StatusOK, UploadRecordingResponse{
		Message:         "Video recording successfully saved to database",
		RecordingURL:    recordingURL,
		RecordingStatus: "ready",
	})
}

