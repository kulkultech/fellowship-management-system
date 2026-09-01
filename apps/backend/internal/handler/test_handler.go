package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type TestHandler struct {
	submissionRepo  *repository.SubmissionRepository
	mcqRepo         *repository.MCQRepository
	questionSetRepo *repository.QuestionSetRepository
	programRepo     *repository.ProgramRepository
	trackRepo       *repository.TrackRepository
	applicantRepo   *repository.ApplicantRepository
	aiInterviewRepo *repository.AIInterviewRepository
}

func NewTestHandler(
	submissionRepo *repository.SubmissionRepository,
	mcqRepo *repository.MCQRepository,
	questionSetRepo *repository.QuestionSetRepository,
	programRepo *repository.ProgramRepository,
	trackRepo *repository.TrackRepository,
	applicantRepo *repository.ApplicantRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
) *TestHandler {
	return &TestHandler{
		submissionRepo:  submissionRepo,
		mcqRepo:         mcqRepo,
		questionSetRepo: questionSetRepo,
		programRepo:     programRepo,
		trackRepo:       trackRepo,
		applicantRepo:   applicantRepo,
		aiInterviewRepo: aiInterviewRepo,
	}
}

type TestSessionResponse struct {
	SubmissionID     string                 `json:"submission_id"`
	ProgramName      string                 `json:"program_name"`
	TrackName        string                 `json:"track_name,omitempty"`
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

	durationMinutes := program.LogicTestDurationMinutes
	displayName := program.Name
	trackName := ""

	var questions []model.MCQQuestion
	if submission.TrackID != nil {
		track, err := h.trackRepo.GetByID(r.Context(), *submission.TrackID)
		if err == nil && track != nil {
			trackName = track.Name
			displayName = fmt.Sprintf("%s - %s", program.Name, track.Name)
			if track.LogicTestDurationMinutes > 0 {
				durationMinutes = track.LogicTestDurationMinutes
			}
			if track.QuestionSetID != nil && h.questionSetRepo != nil {
				questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), *track.QuestionSetID)
			}
			if len(questions) == 0 {
				questions, _ = h.mcqRepo.ListByTrack(r.Context(), track.ID)
			}
		}
	}

	if len(questions) == 0 {
		questions, err = h.mcqRepo.ListByProgram(r.Context(), program.ID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load questions")
			return
		}
	}

	// Calculate expiration based on started_at + duration
	startedAt := submission.StartedAt
	expiresAt := startedAt.Add(time.Duration(durationMinutes) * time.Minute)
	now := time.Now()

	remainingSeconds := int(expiresAt.Sub(now).Seconds())
	if remainingSeconds < 0 {
		remainingSeconds = 0
	}

	// Auto-expire if time ran out and submission is still in progress
	if remainingSeconds == 0 && submission.Status == model.SubmissionInProgress {
		submission.Status = model.SubmissionExpired
		_ = h.submissionRepo.CompleteSubmission(
			r.Context(),
			submission.ID,
			now,
			durationMinutes*60,
			submission.TotalScore,
			submission.Passed,
			submission.Answers,
			model.SubmissionExpired,
		)
	}

	// Convert questions to client-safe format (no answer key)
	clientQuestions := make([]model.ClientQuestion, 0, len(questions))
	for _, q := range questions {
		clientQuestions = append(clientQuestions, q.ToClient())
	}

	httpx.JSON(w, http.StatusOK, TestSessionResponse{
		SubmissionID:     submission.ID.String(),
		ProgramName:      displayName,
		TrackName:        trackName,
		DurationMinutes:  durationMinutes,
		StartedAt:        startedAt,
		ExpiresAt:        expiresAt,
		RemainingSeconds: remainingSeconds,
		Status:           submission.Status,
		Questions:        clientQuestions,
	})
}

type SubmitAnswerItem struct {
	QuestionID       string `json:"question_id"`
	SelectedOptionID string `json:"selected_option_id"`
}

type SubmitTestRequest struct {
	Answers []SubmitAnswerItem `json:"answers"`
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
		httpx.Error(w, http.StatusConflict, "test already submitted")
		return
	}

	program, err := h.programRepo.GetByID(r.Context(), submission.ProgramID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch program")
		return
	}

	passingScore := program.LogicTestPassingScore
	enableAIInterview := program.EnableAIInterview

	var questions []model.MCQQuestion
	if submission.TrackID != nil {
		track, err := h.trackRepo.GetByID(r.Context(), *submission.TrackID)
		if err == nil && track != nil {
			if track.LogicTestPassingScore > 0 {
				passingScore = track.LogicTestPassingScore
			}
			enableAIInterview = track.EnableAIInterview
			if track.QuestionSetID != nil && h.questionSetRepo != nil {
				questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), *track.QuestionSetID)
			}
			if len(questions) == 0 {
				questions, _ = h.mcqRepo.ListByTrack(r.Context(), track.ID)
			}
		}
	}

	if len(questions) == 0 {
		questions, err = h.mcqRepo.ListByProgram(r.Context(), program.ID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load questions for grading")
			return
		}
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

	answersMap := make(map[string]string)
	for _, a := range req.Answers {
		answersMap[a.QuestionID] = a.SelectedOptionID
	}

	totalPointsPossible := 0
	totalPointsScored := 0
	gradedAnswers := make([]model.CandidateAnswer, 0, len(questions))

	for _, q := range questions {
		qIDStr := q.ID.String()
		selectedOption := answersMap[qIDStr]
		isCorrect := selectedOption != "" && selectedOption == q.CorrectOptionID

		if isCorrect {
			totalPointsScored += q.Points
		}
		totalPointsPossible += q.Points

		isCorrPtr := isCorrect
		gradedAnswers = append(gradedAnswers, model.CandidateAnswer{
			QuestionID:       q.ID,
			SelectedOptionID: selectedOption,
			IsCorrect:        &isCorrPtr,
		})
	}

	// Calculate score percentage
	scorePercentage := 0
	if totalPointsPossible > 0 {
		scorePercentage = (totalPointsScored * 100) / totalPointsPossible
	}
	passed := scorePercentage >= passingScore

	// Save test results
	if err := h.submissionRepo.CompleteSubmission(
		r.Context(),
		submission.ID,
		now,
		timeSpentSeconds,
		scorePercentage,
		passed,
		gradedAnswers,
		model.SubmissionCompleted,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to record submission result")
		return
	}

	var inviteToken *string
	var inviteExpires *time.Time

	if passed {
		if enableAIInterview {
			_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageAIInterviewInvited)

			tokenBytes := make([]byte, 16)
			_, _ = rand.Read(tokenBytes)
			tokenStr := hex.EncodeToString(tokenBytes)
			expiresAt := time.Now().Add(7 * 24 * time.Hour)

			interviewSession, err := h.aiInterviewRepo.CreateInvitationWithTrack(
				r.Context(),
				submission.ApplicantID,
				submission.ProgramID,
				submission.TrackID,
				tokenStr,
				expiresAt,
			)
			if err == nil && interviewSession != nil {
				inviteToken = &interviewSession.InvitationToken
				inviteExpires = &interviewSession.InvitationExpiresAt
			}
		} else {
			_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestCompleted)
		}
	} else {
		_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestFailed)
	}

	httpx.JSON(w, http.StatusOK, SubmitTestResponse{
		TotalScore:             scorePercentage,
		PassingScore:           passingScore,
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
	TrackName              string     `json:"track_name,omitempty"`
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

	passingScore := program.LogicTestPassingScore
	trackName := ""
	if submission.TrackID != nil {
		track, err := h.trackRepo.GetByID(r.Context(), *submission.TrackID)
		if err == nil && track != nil {
			trackName = track.Name
			if track.LogicTestPassingScore > 0 {
				passingScore = track.LogicTestPassingScore
			}
		}
	}

	var inviteToken *string
	var inviteExpires *time.Time

	if submission.Passed {
		interview, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), submission.ApplicantID)
		if err == nil && interview != nil {
			tokenStr := interview.InvitationToken
			inviteToken = &tokenStr
			inviteExpires = &interview.InvitationExpiresAt
		}
	}

	httpx.JSON(w, http.StatusOK, TestResultResponse{
		SubmissionID:           submission.ID.String(),
		ApplicantName:          applicant.FullName,
		ProgramName:            program.Name,
		TrackName:              trackName,
		TotalScore:             submission.TotalScore,
		PassingScore:           passingScore,
		Passed:                 submission.Passed,
		TimeSpentSeconds:       submission.TimeSpentSeconds,
		Status:                 string(submission.Status),
		AIInterviewInviteToken: inviteToken,
		AIInterviewExpiresAt:   inviteExpires,
	})
}
