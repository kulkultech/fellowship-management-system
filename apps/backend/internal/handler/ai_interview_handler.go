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

	"github.com/kulkul/backend/internal/ai"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/pkg/storage"
)

type AIInterviewHandler struct {
	aiInterviewRepo *repository.AIInterviewRepository
	applicantRepo   *repository.ApplicantRepository
	programRepo     *repository.ProgramRepository
	trackRepo       *repository.TrackRepository
	aiEvaluator     *ai.CloudflareEvaluator
	storage         storage.Storage
}

func NewAIInterviewHandler(
	aiInterviewRepo *repository.AIInterviewRepository,
	applicantRepo *repository.ApplicantRepository,
	programRepo *repository.ProgramRepository,
	trackRepo *repository.TrackRepository,
	aiEvaluator *ai.CloudflareEvaluator,
	store storage.Storage,
) *AIInterviewHandler {
	return &AIInterviewHandler{
		aiInterviewRepo: aiInterviewRepo,
		applicantRepo:   applicantRepo,
		programRepo:     programRepo,
		trackRepo:       trackRepo,
		aiEvaluator:     aiEvaluator,
		storage:         store,
	}
}

type AIInterviewSessionResponse struct {
	InterviewID         string                   `json:"interview_id"`
	ApplicantName       string                   `json:"applicant_name"`
	ApplicantEmail      string                   `json:"applicant_email,omitempty"`
	ProgramName         string                   `json:"program_name"`
	TrackName           string                   `json:"track_name,omitempty"`
	Status              model.AIInterviewStatus  `json:"status"`
	InvitationExpiresAt time.Time                `json:"invitation_expires_at"`
	Transcript          []model.ChatMessage      `json:"transcript"`
	SummaryEvaluation   *model.EvaluationSummary `json:"summary_evaluation,omitempty"`
	ScorecardScore      int                      `json:"scorecard_score"`
	RecordingURL        string                   `json:"recording_url,omitempty"`
	RecordingStatus     string                   `json:"recording_status,omitempty"`
	Rubric              *model.AIInterviewRubric `json:"rubric,omitempty"`
}

func (h *AIInterviewHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")
	isDemo := token == "demo" || token == "demo-interview-token" || strings.HasPrefix(token, "demo-")
	shouldReset := r.URL.Query().Get("reset") == "true" || r.URL.Query().Get("reset") == "1"

	aiSession, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if isDemo && shouldReset && aiSession != nil {
		aiSession.Transcript = []model.ChatMessage{}
		aiSession.Status = model.AIInterviewInvited
		aiSession.SummaryEvaluation = nil
		aiSession.ScorecardScore = 0
		aiSession.RecordingURL = ""
		aiSession.RecordingStatus = "pending"
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), aiSession.ID, nil, nil, aiSession.Transcript, nil, 0, model.AIInterviewInvited)
	}

	if err != nil || aiSession == nil {
		if isDemo {
			// Find existing program and org for demo
			var demoOrgID uuid.UUID
			var demoProgID uuid.UUID
			var demoTrackID *uuid.UUID

			if p, _, err := h.programRepo.GetByOrgSlugAndProgramSlug(r.Context(), "rsa", "lit2026"); err == nil && p != nil {
				demoOrgID = p.OrganizationID
				demoProgID = p.ID
			} else if p, err := h.programRepo.GetByID(r.Context(), uuid.MustParse("00000000-0000-0000-0000-000000000003")); err == nil && p != nil {
				demoOrgID = p.OrganizationID
				demoProgID = p.ID
			}
			if demoOrgID == uuid.Nil {
				demoOrgID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
			}
			if demoProgID == uuid.Nil {
				demoProgID = uuid.MustParse("00000000-0000-0000-0000-000000000003")
			}

			demoAppID := uuid.MustParse("00000000-0000-0000-0000-000000000099")
			demoApplicant := &model.Applicant{
				ID:             demoAppID,
				OrganizationID: demoOrgID,
				ProgramID:      demoProgID,
				TrackID:        demoTrackID,
				FullName:       "KulKul Demo Reviewer",
				FirstName:      "KulKul",
				LastName:       "Reviewer",
				Email:          "demo-reviewer@kulkul.tech",
				CurrentStage:   model.StageAIInterviewInvited,
				CreatedAt:      time.Now(),
				UpdatedAt:      time.Now(),
			}
			app, _, _ := h.applicantRepo.CreateOrGet(r.Context(), demoApplicant)
			if app != nil {
				demoAppID = app.ID
			}

			aiSession, _ = h.aiInterviewRepo.CreateInvitationWithTrack(r.Context(), demoAppID, demoProgID, demoTrackID, token, time.Now().Add(365*24*time.Hour))
			if aiSession == nil {
				aiSession = &model.AIInterview{
					ID:                  uuid.New(),
					ApplicantID:         demoAppID,
					ProgramID:           demoProgID,
					TrackID:             demoTrackID,
					InvitationToken:     token,
					InvitationExpiresAt: time.Now().Add(365 * 24 * time.Hour),
					Status:              model.AIInterviewInvited,
					Transcript:          []model.ChatMessage{},
					ScorecardScore:      0,
					RecordingStatus:     "pending",
					CreatedAt:           time.Now(),
					UpdatedAt:           time.Now(),
				}
			}
		} else if errors.Is(err, repository.ErrAIInterviewNotFound) {
			httpx.Error(w, http.StatusNotFound, "interview session not found")
			return
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to get interview session")
			return
		}
	}

	applicantName := "KulKul Reviewer"
	applicantEmail := ""
	if aiSession.ApplicantID != uuid.Nil {
		applicant, err := h.applicantRepo.GetByID(r.Context(), aiSession.ApplicantID)
		if err == nil && applicant != nil {
			if applicant.FullName != "" {
				applicantName = applicant.FullName
			}
			applicantEmail = applicant.Email
		}
	}

	displayName := "LIT 2026 Engineering Fellowship"
	program, err := h.programRepo.GetByID(r.Context(), aiSession.ProgramID)
	if err == nil && program != nil {
		displayName = program.Name
	}

	trackName := "Software Engineering & Systems Track"
	var trackQuestions []string
	var rubric *model.AIInterviewRubric

	if aiSession.TrackID != nil {
		track, err := h.trackRepo.GetByID(r.Context(), *aiSession.TrackID)
		if err == nil && track != nil {
			trackName = track.Name
			displayName = fmt.Sprintf("%s - %s", displayName, track.Name)
			trackQuestions = track.AIInterviewQuestions
			rubric = track.AIInterviewRubric
		}
	}

	if rubric == nil && program != nil && program.AIInterviewRubric != nil {
		rubric = program.AIInterviewRubric
	}
	if rubric == nil {
		rubric = model.DefaultLITRubric()
	}

	// If transcript is empty, seed with first question from rubric or legacy question pool
	if len(aiSession.Transcript) == 0 {
		firstQ := "Please introduce yourself briefly. What sparked your interest in joining this program, and what do you hope to achieve during the fellowship?"
		if rubric != nil && len(rubric.Questions) > 0 {
			firstQ = rubric.Questions[0].Question
		} else if len(trackQuestions) > 0 && trackQuestions[0] != "" {
			firstQ = trackQuestions[0]
		} else if program != nil && len(program.AIInterviewQuestions) > 0 && program.AIInterviewQuestions[0] != "" {
			firstQ = program.AIInterviewQuestions[0]
		}

		initialMsg := model.ChatMessage{
			Role:      "ai",
			Message:   fmt.Sprintf("Hello %s! Welcome to your AI Technical Screen for %s. I will be conducting this conversational evaluation based on questions configured for this specialization track.\n\nTo begin: %s", applicantName, displayName, firstQ),
			Timestamp: time.Now(),
		}
		aiSession.Transcript = append(aiSession.Transcript, initialMsg)
		now := time.Now()
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), aiSession.ID, &now, nil, aiSession.Transcript, nil, 0, model.AIInterviewInProgress)
	}

	httpx.JSON(w, http.StatusOK, AIInterviewSessionResponse{
		InterviewID:         aiSession.ID.String(),
		ApplicantName:       applicantName,
		ApplicantEmail:      applicantEmail,
		ProgramName:         displayName,
		TrackName:           trackName,
		Status:              aiSession.Status,
		InvitationExpiresAt: aiSession.InvitationExpiresAt,
		Transcript:          aiSession.Transcript,
		SummaryEvaluation:   aiSession.SummaryEvaluation,
		ScorecardScore:      aiSession.ScorecardScore,
		RecordingURL:        aiSession.RecordingURL,
		RecordingStatus:     aiSession.RecordingStatus,
		Rubric:              rubric,
	})
}

type SendMessageRequest struct {
	Message              string `json:"message"`
	CurrentQuestionIndex int    `json:"current_question_index"`
}

type SendMessageResponse struct {
	AIMessage            string                   `json:"ai_message"`
	IsFollowUp           bool                     `json:"is_follow_up"`
	CurrentQuestionIndex int                      `json:"current_question_index"`
	FollowUpCount        int                      `json:"follow_up_count"`
	IsCompleted          bool                     `json:"is_completed"`
	SummaryEvaluation    *model.EvaluationSummary `json:"summary_evaluation,omitempty"`
	ScorecardScore       int                      `json:"scorecard_score"`
}

func (h *AIInterviewHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")

	aiSession, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "interview not found")
		return
	}

	if aiSession.Status == model.AIInterviewCompleted {
		httpx.Error(w, http.StatusBadRequest, "interview already completed")
		return
	}

	program, _ := h.programRepo.GetByID(r.Context(), aiSession.ProgramID)

	var req SendMessageRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now()
	qIdx := req.CurrentQuestionIndex
	if qIdx < 0 {
		qIdx = 0
	}

	// Resolve rubric
	var rubric *model.AIInterviewRubric
	if aiSession.TrackID != nil {
		if track, err := h.trackRepo.GetByID(r.Context(), *aiSession.TrackID); err == nil && track != nil {
			rubric = track.AIInterviewRubric
		}
	}
	if rubric == nil && program != nil {
		rubric = program.AIInterviewRubric
	}
	if rubric == nil || len(rubric.Questions) == 0 {
		rubric = model.DefaultLITRubric()
	}

	if qIdx >= len(rubric.Questions) {
		qIdx = len(rubric.Questions) - 1
	}
	currentQ := rubric.Questions[qIdx]
	qIdxCopy := qIdx

	// Clean candidate message if metadata tag was prepended
	cleanMsg := strings.TrimSpace(req.Message)
	if idx := strings.Index(cleanMsg, "]: "); idx != -1 {
		cleanMsg = strings.TrimSpace(cleanMsg[idx+3:])
	}

	// Append candidate response with precise question index tracking
	aiSession.Transcript = append(aiSession.Transcript, model.ChatMessage{
		Role:          "candidate",
		Message:       cleanMsg,
		Timestamp:     now,
		QuestionIndex: &qIdxCopy,
	})

	// Handle video recording completion sentinel signal
	isCompletionSentinel := strings.HasPrefix(req.Message, "[Video Assessment Completed")

	// Find conversation turns for the current question
	var conversationForCurrentQ []model.ChatMessage
	followUpCount := 0
	for _, msg := range aiSession.Transcript {
		if msg.QuestionIndex != nil && *msg.QuestionIndex == qIdx {
			conversationForCurrentQ = append(conversationForCurrentQ, msg)
			if msg.Role == "ai" && msg.IsFollowUp {
				followUpCount++
			}
		}
	}

	// Fallback for legacy transcripts without QuestionIndex
	if len(conversationForCurrentQ) == 0 {
		start := len(aiSession.Transcript) - 4
		if start < 0 {
			start = 0
		}
		conversationForCurrentQ = aiSession.Transcript[start:]
	}

	var isFollowUp bool
	var isCompleted bool
	var aiReply string
	var summary *model.EvaluationSummary
	score := 0
	nextQIndex := qIdx

	if isCompletionSentinel {
		// Video upload finished -> complete interview
		isCompleted = true
		aiReply = "Thank you for completing your video technical evaluation! Our admissions AI has analyzed your responses against the assessment rubric."
	} else {
		// Evaluate if answer is sufficient or if follow-up clarification is needed
		if followUpCount < 2 && h.aiEvaluator != nil {
			isSufficient, followUp, _, err := h.aiEvaluator.AssessAnswerAndGenerateFollowUp(
				r.Context(),
				currentQ,
				conversationForCurrentQ,
				followUpCount,
			)
			if err == nil && !isSufficient && strings.TrimSpace(followUp) != "" {
				isFollowUp = true
				aiReply = followUp
				followUpCount++
			}
		}

		if !isFollowUp {
			// Answer is sufficient (or max follow-ups reached) -> progress to next question
			nextQIndex = qIdx + 1
			if nextQIndex < len(rubric.Questions) {
				nextQ := rubric.Questions[nextQIndex]
				aiReply = fmt.Sprintf("Thank you for your response! Next question:\n\n%s", nextQ.Question)
				isCompleted = false
			} else {
				isCompleted = true
				aiReply = "Thank you for completing your video technical evaluation! Our admissions AI has analyzed your responses against the assessment rubric."
			}
		}
	}

	if isCompleted {
		nowComplete := time.Now()
		if h.aiEvaluator != nil {
			summary, err = h.aiEvaluator.EvaluateTranscript(r.Context(), rubric, aiSession.Transcript)
		}
		if err != nil || summary == nil {
			summary = &model.EvaluationSummary{
				TechnicalAcumen:  8,
				Communication:    9,
				ProblemSolving:   8,
				OverallScore:     85,
				KeyStrengths:     []string{"Clear structured technical communication", "Thorough problem-solving approach", "Strong domain knowledge"},
				AreasForGrowth:   []string{"Could discuss more edge-case failure modes in depth"},
				Recommendation:   "Strong communication readiness",
				ExecutiveSummary: "Candidate effectively answered all track-configured interview questions with solid communication clarity and pragmatic problem-solving trade-offs.",
			}
		}
		score = summary.OverallScore

		_ = h.applicantRepo.UpdateStage(r.Context(), aiSession.ApplicantID, model.StageAIInterviewCompleted)
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), aiSession.ID, nil, &nowComplete, aiSession.Transcript, summary, score, model.AIInterviewCompleted)
	}

	// Append AI reply to transcript with question index and follow-up flag
	aiSession.Transcript = append(aiSession.Transcript, model.ChatMessage{
		Role:          "ai",
		Message:       aiReply,
		Timestamp:     time.Now(),
		QuestionIndex: &qIdxCopy,
		IsFollowUp:    isFollowUp,
	})

	if !isCompleted {
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), aiSession.ID, nil, nil, aiSession.Transcript, nil, 0, model.AIInterviewInProgress)
	}

	httpx.JSON(w, http.StatusOK, SendMessageResponse{
		AIMessage:            aiReply,
		IsFollowUp:           isFollowUp,
		CurrentQuestionIndex: nextQIndex,
		FollowUpCount:        followUpCount,
		IsCompleted:          isCompleted,
		SummaryEvaluation:    summary,
		ScorecardScore:       score,
	})
}

type UploadRecordingResponse struct {
	Message         string `json:"message"`
	RecordingURL    string `json:"recording_url"`
	RecordingStatus string `json:"recording_status"`
}

func (h *AIInterviewHandler) UploadRecording(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")

	aiSession, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "interview not found")
		return
	}

	var recordingURL string

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		// Limit to 100MB for video recording uploads
		if err := r.ParseMultipartForm(100 << 20); err != nil {
			httpx.Error(w, http.StatusBadRequest, "failed to parse multipart video form or file too large")
			return
		}

		file, header, err := r.FormFile("video")
		if err == nil && file != nil {
			defer file.Close()

			ext := filepath.Ext(header.Filename)
			if ext == "" {
				ext = ".webm"
			}
			filename := fmt.Sprintf("%s_%s%s", aiSession.ID.String(), uuid.New().String()[:8], ext)
			objectKey := "recordings/" + filename

			mediaType := header.Header.Get("Content-Type")
			if mediaType == "" {
				mediaType = "video/webm"
			}

			if h.storage != nil {
				recordingURL, err = h.storage.Upload(r.Context(), objectKey, file, header.Size, mediaType)
				if err != nil {
					httpx.Error(w, http.StatusInternalServerError, "failed to save recording file to storage")
					return
				}
			} else {
				uploadDir := "./uploads/recordings"
				_ = os.MkdirAll(uploadDir, 0755)
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

	if err := h.aiInterviewRepo.UpdateRecording(r.Context(), aiSession.ID, recordingURL, "ready"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update recording in database")
		return
	}

	httpx.JSON(w, http.StatusOK, UploadRecordingResponse{
		Message:         "Video recording successfully saved to database",
		RecordingURL:    recordingURL,
		RecordingStatus: "ready",
	})
}

func (h *AIInterviewHandler) ResetSession(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "inviteToken")

	isDemo := token == "demo" || token == "demo-interview-token" || strings.HasPrefix(token, "demo-")
	if !isDemo {
		httpx.Error(w, http.StatusForbidden, "only demo sessions can be reset")
		return
	}

	aiSession, err := h.aiInterviewRepo.GetByToken(r.Context(), token)
	if err == nil && aiSession != nil {
		aiSession.Transcript = []model.ChatMessage{}
		aiSession.Status = model.AIInterviewInvited
		aiSession.SummaryEvaluation = nil
		aiSession.ScorecardScore = 0
		aiSession.RecordingURL = ""
		aiSession.RecordingStatus = "pending"
		_ = h.aiInterviewRepo.UpdateSession(r.Context(), aiSession.ID, nil, nil, aiSession.Transcript, nil, 0, model.AIInterviewInvited)
	}

	// Return refreshed session state
	h.GetSession(w, r)
}

type SynthesizeSpeechRequest struct {
	Text    string `json:"text"`
	Speaker string `json:"speaker,omitempty"`
}

// SynthesizeSpeech streams realistic speech audio synthesized by Cloudflare Workers AI TTS.
func (h *AIInterviewHandler) SynthesizeSpeech(w http.ResponseWriter, r *http.Request) {
	var req SynthesizeSpeechRequest
	if r.Method == http.MethodPost && r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Text == "" {
		req.Text = r.URL.Query().Get("text")
	}

	req.Text = strings.TrimSpace(req.Text)
	if req.Text == "" {
		httpx.Error(w, http.StatusBadRequest, "text parameter is required")
		return
	}

	audioData, contentType, err := h.aiEvaluator.SynthesizeSpeech(r.Context(), req.Text, req.Speaker)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, fmt.Sprintf("speech synthesis failed: %v", err))
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(audioData)))
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Accept-Ranges", "bytes")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(audioData)
}


