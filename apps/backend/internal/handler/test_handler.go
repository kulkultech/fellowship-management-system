package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type TestHandler struct {
	submissionRepo  *repository.SubmissionRepository
	mcqRepo         *repository.MCQRepository
	programRepo     *repository.ProgramRepository
	applicantRepo   *repository.ApplicantRepository
	aiInterviewRepo *repository.AIInterviewRepository
}

func NewTestHandler(
	submissionRepo *repository.SubmissionRepository,
	mcqRepo *repository.MCQRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
) *TestHandler {
	return &TestHandler{
		submissionRepo:  submissionRepo,
		mcqRepo:         mcqRepo,
		programRepo:     programRepo,
		applicantRepo:   applicantRepo,
		aiInterviewRepo: aiInterviewRepo,
	}
}

type TestSessionResponse struct {
	SubmissionID     string                 `json:"submission_id"`
	ProgramName      string                 `json:"program_name"`
	DurationMinutes  int                    `json:"duration_minutes"`
	StartedAt        time.Time              `json:"started_at"`
	ExpiresAt        time.Time              `json:"expires_at"`
	RemainingSeconds int                    `json:"remaining_seconds"`
	Status           model.SubmissionStatus `json:"status"`
	Questions        []model.ClientQuestion `json:"questions"`
}

func (h *TestHandler) GetTestSession(w http.ResponseWriter, r *http.Request) {
	testToken := chi.URLParam(r, "testToken")

	submission, err := h.submissionRepo.GetByToken(r.Context(), testToken)
	if err != nil {
		if errors.Is(err, repository.ErrSubmissionNotFound) {
			httpx.Error(w, http.StatusNotFound, "invalid or expired test link")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch test session")
		return
	}

	program, err := h.programRepo.GetByID(r.Context(), submission.ProgramID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch program details")
		return
	}

	// Calculate expiration based on started_at + duration
	duration := time.Duration(program.LogicTestDurationMinutes) * time.Minute
	expiresAt := submission.StartedAt.Add(duration)
	remaining := int(time.Until(expiresAt).Seconds())
	if remaining < 0 {
		remaining = 0
	}

	// If already completed or expired, send state
	if submission.Status == model.SubmissionCompleted {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"submission_id": submission.ID.String(),
			"status":        submission.Status,
			"already_done":  true,
		})
		return
	}

	// Fetch questions and sanitize for client
	questions, err := h.mcqRepo.ListByProgram(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load questions")
		return
	}

	clientQuestions := make([]model.ClientQuestion, 0, len(questions))
	for _, q := range questions {
		clientQuestions = append(clientQuestions, q.ToClient())
	}

	httpx.JSON(w, http.StatusOK, TestSessionResponse{
		SubmissionID:     submission.ID.String(),
		ProgramName:      program.Name,
		DurationMinutes:  program.LogicTestDurationMinutes,
		StartedAt:        submission.StartedAt,
		ExpiresAt:        expiresAt,
		RemainingSeconds: remaining,
		Status:           submission.Status,
		Questions:        clientQuestions,
	})
}

type AnswerInput struct {
	QuestionID       string `json:"question_id"`
	SelectedOptionID string `json:"selected_option_id"`
}

type SubmitTestRequest struct {
	Answers []AnswerInput `json:"answers"`
}

type SubmitTestResponse struct {
	TotalScore             int        `json:"total_score"`
	PassingScore           int        `json:"passing_score"`
	Passed                 bool       `json:"passed"`
	Status                 string     `json:"status"`
	AIInterviewInviteToken *string    `json:"ai_interview_invite_token,omitempty"`
	AIInterviewExpiresAt   *time.Time `json:"ai_interview_expires_at,omitempty"`
}

func (h *TestHandler) SubmitTest(w http.ResponseWriter, r *http.Request) {
	testToken := chi.URLParam(r, "testToken")

	submission, err := h.submissionRepo.GetByToken(r.Context(), testToken)
	if err != nil {
		if errors.Is(err, repository.ErrSubmissionNotFound) {
			httpx.Error(w, http.StatusNotFound, "test not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch submission")
		return
	}

	if submission.Status == model.SubmissionCompleted {
		httpx.Error(w, http.StatusBadRequest, "test has already been submitted")
		return
	}

	program, err := h.programRepo.GetByID(r.Context(), submission.ProgramID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch program")
		return
	}

	var req SubmitTestRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now()
	timeSpentSeconds := int(now.Sub(submission.StartedAt).Seconds())
	if timeSpentSeconds < 0 {
		timeSpentSeconds = 0
	}

	// Fetch all questions for scoring
	questions, err := h.mcqRepo.ListByProgram(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load questions for grading")
		return
	}

	answersMap := make(map[string]string)
	for _, a := range req.Answers {
		answersMap[a.QuestionID] = a.SelectedOptionID
	}

	totalPointsPossible := 0
	totalPointsScored := 0
	gradedAnswers := make([]model.CandidateAnswer, 0, len(questions))

	for _, q := range questions {
		totalPointsPossible += q.Points
		qIDStr := q.ID.String()
		selected := answersMap[qIDStr]

		isCorrect := selected != "" && selected == q.CorrectOptionID
		if isCorrect {
			totalPointsScored += q.Points
		}

		isCorrectPtr := isCorrect
		parsedQID, _ := uuid.Parse(qIDStr)
		gradedAnswers = append(gradedAnswers, model.CandidateAnswer{
			QuestionID:       parsedQID,
			SelectedOptionID: selected,
			IsCorrect:        &isCorrectPtr,
		})
	}

	scorePercentage := 0
	if totalPointsPossible > 0 {
		scorePercentage = (totalPointsScored * 100) / totalPointsPossible
	}

	passed := scorePercentage >= program.LogicTestPassingScore

	// Update test submission
	err = h.submissionRepo.CompleteSubmission(
		r.Context(),
		submission.ID,
		now,
		timeSpentSeconds,
		scorePercentage,
		passed,
		gradedAnswers,
		model.SubmissionCompleted,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save test score")
		return
	}

	// Update applicant stage and trigger AI interview if passed
	var inviteToken *string
	var inviteExpires *time.Time

	if passed {
		_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageAIInterviewInvited)

		// Create AI interview invitation valid for 48 hours
		invitationToken := generateToken(24)
		expires := now.Add(48 * time.Hour)
		ai, err := h.aiInterviewRepo.CreateInvitation(r.Context(), submission.ApplicantID, program.ID, invitationToken, expires)
		if err == nil && ai != nil {
			tok := ai.InvitationToken
			inviteToken = &tok
			exp := ai.InvitationExpiresAt
			inviteExpires = &exp
		}
	} else {
		_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestFailed)
	}

	httpx.JSON(w, http.StatusOK, SubmitTestResponse{
		TotalScore:             scorePercentage,
		PassingScore:           program.LogicTestPassingScore,
		Passed:                 passed,
		Status:                 "completed",
		AIInterviewInviteToken: inviteToken,
		AIInterviewExpiresAt:   inviteExpires,
	})
}

type TestResultResponse struct {
	SubmissionID           string     `json:"submission_id"`
	ApplicantName          string     `json:"applicant_name"`
	ProgramName            string     `json:"program_name"`
	TotalScore             int        `json:"total_score"`
	PassingScore           int        `json:"passing_score"`
	Passed                 bool       `json:"passed"`
	TimeSpentSeconds       int        `json:"time_spent_seconds"`
	Status                 string     `json:"status"`
	AIInterviewInviteToken *string    `json:"ai_interview_invite_token,omitempty"`
	AIInterviewExpiresAt   *time.Time `json:"ai_interview_expires_at,omitempty"`
}

func (h *TestHandler) GetResult(w http.ResponseWriter, r *http.Request) {
	testToken := chi.URLParam(r, "testToken")

	submission, err := h.submissionRepo.GetByToken(r.Context(), testToken)
	if err != nil {
		if errors.Is(err, repository.ErrSubmissionNotFound) {
			httpx.Error(w, http.StatusNotFound, "submission not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch submission")
		return
	}

	applicant, err := h.applicantRepo.GetByID(r.Context(), submission.ApplicantID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch applicant")
		return
	}

	program, err := h.programRepo.GetByID(r.Context(), submission.ProgramID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch program")
		return
	}

	var inviteToken *string
	var inviteExpires *time.Time

	if submission.Passed {
		ai, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), applicant.ID)
		if err == nil && ai != nil {
			tok := ai.InvitationToken
			inviteToken = &tok
			exp := ai.InvitationExpiresAt
			inviteExpires = &exp
		}
	}

	httpx.JSON(w, http.StatusOK, TestResultResponse{
		SubmissionID:           submission.ID.String(),
		ApplicantName:          applicant.FullName,
		ProgramName:            program.Name,
		TotalScore:             submission.TotalScore,
		PassingScore:           program.LogicTestPassingScore,
		Passed:                 submission.Passed,
		TimeSpentSeconds:       submission.TimeSpentSeconds,
		Status:                 string(submission.Status),
		AIInterviewInviteToken: inviteToken,
		AIInterviewExpiresAt:   inviteExpires,
	})
}
