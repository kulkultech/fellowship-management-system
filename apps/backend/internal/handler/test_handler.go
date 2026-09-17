package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/email"
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
	orgRepo         *repository.OrgRepository
	emailSvc        email.Service
	frontendURL     string
}

func NewTestHandler(
	submissionRepo *repository.SubmissionRepository,
	mcqRepo *repository.MCQRepository,
	questionSetRepo *repository.QuestionSetRepository,
	programRepo *repository.ProgramRepository,
	trackRepo *repository.TrackRepository,
	applicantRepo *repository.ApplicantRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
	orgRepo *repository.OrgRepository,
	emailSvc email.Service,
	frontendURL string,
) *TestHandler {
	if frontendURL == "" {
		frontendURL = "https://fellowhire.kul.to"
	}
	return &TestHandler{
		submissionRepo:  submissionRepo,
		mcqRepo:         mcqRepo,
		questionSetRepo: questionSetRepo,
		programRepo:     programRepo,
		trackRepo:       trackRepo,
		applicantRepo:   applicantRepo,
		aiInterviewRepo: aiInterviewRepo,
		orgRepo:         orgRepo,
		emailSvc:        emailSvc,
		frontendURL:     strings.TrimRight(frontendURL, "/"),
	}
}

type TestSessionResponse struct {
	SubmissionID     string                 `json:"submission_id"`
	CandidateEmail   string                 `json:"candidate_email"`
	CandidateName    string                 `json:"candidate_name,omitempty"`
	ProgramName      string                 `json:"program_name"`
	TrackName        string                 `json:"track_name,omitempty"`
	DurationMinutes  int                    `json:"duration_minutes"`
	PassingScore     int                    `json:"passing_score"`
	QuestionCount    int                    `json:"question_count"`
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

	candidateEmail := ""
	candidateName := ""
	if applicant, err := h.applicantRepo.GetByID(r.Context(), submission.ApplicantID); err == nil && applicant != nil {
		candidateEmail = applicant.Email
		candidateName = applicant.FullName
	}

	program, err := h.programRepo.GetByID(r.Context(), submission.ProgramID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch program details")
		return
	}

	durationMinutes := program.LogicTestDurationMinutes
	passingScore := program.LogicTestPassingScore
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
			if track.LogicTestPassingScore > 0 {
				passingScore = track.LogicTestPassingScore
			}
			if track.QuestionSetID != nil && h.questionSetRepo != nil {
				questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), *track.QuestionSetID)
			}
			if len(questions) == 0 {
				questions, _ = h.mcqRepo.ListByTrack(r.Context(), track.ID)
			}
		}
	}

	if len(questions) == 0 && program.QuestionSetID != nil && h.questionSetRepo != nil {
		questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), *program.QuestionSetID)
	}
	if len(questions) == 0 {
		questions, _ = h.mcqRepo.ListByProgram(r.Context(), program.ID)
	}
	if len(questions) == 0 && h.questionSetRepo != nil {
		if sets, _ := h.questionSetRepo.List(r.Context(), &program.ID, &program.OrganizationID); len(sets) > 0 {
			questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), sets[0].ID)
		}
	}
	if len(questions) == 0 {
		httpx.Error(w, http.StatusInternalServerError, "failed to load questions for test session")
		return
	}

	startedAt := submission.StartedAt
	expiresAt := startedAt.Add(time.Duration(durationMinutes) * time.Minute)
	now := time.Now()

	remainingSeconds := durationMinutes * 60
	if submission.Status == model.SubmissionPending {
		startedAt = now
		expiresAt = now.Add(time.Duration(durationMinutes) * time.Minute)
		remainingSeconds = durationMinutes * 60
	} else if submission.Status == model.SubmissionInProgress {
		remainingSeconds = int(expiresAt.Sub(now).Seconds())
		if remainingSeconds < 0 {
			remainingSeconds = 0
		}
		// Auto-expire if time ran out and submission is still in progress
		if remainingSeconds == 0 {
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
			_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestFailed)
		}
	} else if submission.Status == model.SubmissionCompleted || submission.Status == model.SubmissionExpired {
		remainingSeconds = 0
	}

	// Convert questions to client-safe format (no answer key)
	clientQuestions := make([]model.ClientQuestion, 0, len(questions))
	for _, q := range questions {
		clientQuestions = append(clientQuestions, q.ToClient())
	}

	httpx.JSON(w, http.StatusOK, TestSessionResponse{
		SubmissionID:     submission.ID.String(),
		CandidateEmail:   candidateEmail,
		CandidateName:    candidateName,
		ProgramName:      displayName,
		TrackName:        trackName,
		DurationMinutes:  durationMinutes,
		PassingScore:     passingScore,
		QuestionCount:    len(clientQuestions),
		StartedAt:        startedAt,
		ExpiresAt:        expiresAt,
		RemainingSeconds: remainingSeconds,
		Status:           submission.Status,
		Questions:        clientQuestions,
	})
}

func (h *TestHandler) StartTest(w http.ResponseWriter, r *http.Request) {
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

	if submission.Status == model.SubmissionCompleted {
		httpx.Error(w, http.StatusBadRequest, "test session already completed")
		return
	}

	program, err := h.programRepo.GetByID(r.Context(), submission.ProgramID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch program details")
		return
	}

	durationMinutes := program.LogicTestDurationMinutes
	passingScore := program.LogicTestPassingScore
	displayName := program.Name
	trackName := ""

	if submission.TrackID != nil {
		track, err := h.trackRepo.GetByID(r.Context(), *submission.TrackID)
		if err == nil && track != nil {
			trackName = track.Name
			displayName = fmt.Sprintf("%s - %s", program.Name, track.Name)
			if track.LogicTestDurationMinutes > 0 {
				durationMinutes = track.LogicTestDurationMinutes
			}
			if track.LogicTestPassingScore > 0 {
				passingScore = track.LogicTestPassingScore
			}
		}
	}

	now := time.Now()
	// If starting for the first time (pending), anchor started_at to now
	if submission.Status == model.SubmissionPending {
		submission.StartedAt = now
		submission.Status = model.SubmissionInProgress
		_ = h.submissionRepo.StartSubmission(r.Context(), submission.ID, now)
		_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestInProgress)
	}

	candidateEmail := ""
	candidateName := ""
	if applicant, err := h.applicantRepo.GetByID(r.Context(), submission.ApplicantID); err == nil && applicant != nil {
		candidateEmail = applicant.Email
		candidateName = applicant.FullName
	}

	var questions []model.MCQQuestion
	if submission.TrackID != nil {
		track, err := h.trackRepo.GetByID(r.Context(), *submission.TrackID)
		if err == nil && track != nil {
			if track.QuestionSetID != nil && h.questionSetRepo != nil {
				questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), *track.QuestionSetID)
			}
			if len(questions) == 0 {
				questions, _ = h.mcqRepo.ListByTrack(r.Context(), track.ID)
			}
		}
	}
	if len(questions) == 0 && program.QuestionSetID != nil && h.questionSetRepo != nil {
		questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), *program.QuestionSetID)
	}
	if len(questions) == 0 {
		questions, _ = h.mcqRepo.ListByProgram(r.Context(), program.ID)
	}
	if len(questions) == 0 && h.questionSetRepo != nil {
		if sets, _ := h.questionSetRepo.List(r.Context(), &program.ID, &program.OrganizationID); len(sets) > 0 {
			questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), sets[0].ID)
		}
	}

	startedAt := submission.StartedAt
	expiresAt := startedAt.Add(time.Duration(durationMinutes) * time.Minute)
	remainingSeconds := int(expiresAt.Sub(time.Now()).Seconds())
	if remainingSeconds < 0 {
		remainingSeconds = 0
	}
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
		_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestFailed)
	}

	clientQuestions := make([]model.ClientQuestion, 0, len(questions))
	for _, q := range questions {
		clientQuestions = append(clientQuestions, q.ToClient())
	}

	httpx.JSON(w, http.StatusOK, TestSessionResponse{
		SubmissionID:     submission.ID.String(),
		CandidateEmail:   candidateEmail,
		CandidateName:    candidateName,
		ProgramName:      displayName,
		TrackName:        trackName,
		DurationMinutes:  durationMinutes,
		PassingScore:     passingScore,
		QuestionCount:    len(clientQuestions),
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
	NextStep               string     `json:"next_step,omitempty"`
	RedirectURL            string     `json:"redirect_url,omitempty"`
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

	if len(questions) == 0 && program.QuestionSetID != nil && h.questionSetRepo != nil {
		questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), *program.QuestionSetID)
	}
	if len(questions) == 0 {
		questions, _ = h.mcqRepo.ListByProgram(r.Context(), program.ID)
	}
	if len(questions) == 0 && h.questionSetRepo != nil {
		if sets, _ := h.questionSetRepo.List(r.Context(), &program.ID, &program.OrganizationID); len(sets) > 0 {
			questions, _ = h.questionSetRepo.ListQuestionsBySetID(r.Context(), sets[0].ID)
		}
	}
	if len(questions) == 0 {
		httpx.Error(w, http.StatusInternalServerError, "failed to load questions for grading")
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
	nextStep := ""
	redirectURL := ""

	if passed {
		flowNext := program.NextStepAfter(model.FlowStepMCQ)
		if flowNext == model.FlowStepAIInterview && !enableAIInterview {
			flowNext = program.NextStepAfter(model.FlowStepAIInterview)
		}

		switch flowNext {
		case model.FlowStepAIInterview:
			nextStep = "ai_interview"
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
				redirectURL = fmt.Sprintf("/interview/%s", *inviteToken)
			}
		case model.FlowStepForm:
			nextStep = "fill_form"
			_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestCompleted)
			orgSlug := "acme"
			if h.orgRepo != nil {
				if org, err := h.orgRepo.GetByID(r.Context(), program.OrganizationID); err == nil && org != nil {
					orgSlug = org.Slug
				}
			}
				if !program.IsOpen() && program.PreviewToken != uuid.Nil {
					redirectURL = fmt.Sprintf("/programs/%s/%s/apply?preview=%s", orgSlug, program.Slug, program.PreviewToken.String())
				} else {
					redirectURL = fmt.Sprintf("/programs/%s/%s/apply", orgSlug, program.Slug)
				}
		default:
			nextStep = "completed"
			_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestCompleted)
		}
	} else {
		_ = h.applicantRepo.UpdateStage(r.Context(), submission.ApplicantID, model.StageTestFailed)
	}

	if h.emailSvc != nil {
		applicant, _ := h.applicantRepo.GetByID(r.Context(), submission.ApplicantID)
		if applicant != nil && applicant.Email != "" {
			trackName := ""
			if submission.TrackID != nil {
				if tr, err := h.trackRepo.GetByID(r.Context(), *submission.TrackID); err == nil && tr != nil {
					trackName = tr.Name
				}
			}
			resultURL := fmt.Sprintf("%s/result/%s", h.frontendURL, submission.TestToken)
			actionURL := resultURL
			if redirectURL != "" {
				actionURL = fmt.Sprintf("%s%s", h.frontendURL, redirectURL)
			}

			// Trigger 3: Email after logic test submission
			_ = h.emailSvc.SendLogicTestSubmittedEmail(applicant.Email, applicant.FullName, program.Name, trackName, resultURL)

			// Trigger 4: Email of the result of the logic test (passed or not)
			_ = h.emailSvc.SendLogicTestResultEmail(applicant.Email, applicant.FullName, program.Name, trackName, scorePercentage, passingScore, passed, resultURL, actionURL, nextStep)

			// Trigger 5: AI interview invitation if passed & invited directly
			if passed && nextStep == "ai_interview" && inviteToken != nil && inviteExpires != nil {
				aiInterviewURL := fmt.Sprintf("%s/interview/%s", h.frontendURL, *inviteToken)
				_ = h.emailSvc.SendAIInterviewInvitationEmail(applicant.Email, applicant.FullName, program.Name, trackName, aiInterviewURL, *inviteExpires)
			}
		}
	}

	httpx.JSON(w, http.StatusOK, SubmitTestResponse{
		TotalScore:             scorePercentage,
		PassingScore:           passingScore,
		Passed:                 passed,
		Status:                 "completed",
		AIInterviewInviteToken: inviteToken,
		AIInterviewExpiresAt:   inviteExpires,
		NextStep:               nextStep,
		RedirectURL:            redirectURL,
	})
}

type TestResultResponse struct {
	SubmissionID           string     `json:"submission_id"`
	ApplicantName          string     `json:"applicant_name"`
	CandidateEmail         string     `json:"candidate_email,omitempty"`
	ProgramName            string     `json:"program_name"`
	OrgSlug                string     `json:"org_slug,omitempty"`
	ProgramSlug            string     `json:"program_slug,omitempty"`
	TrackName              string     `json:"track_name,omitempty"`
	TotalScore             int        `json:"total_score"`
	PassingScore           int        `json:"passing_score"`
	Passed                 bool       `json:"passed"`
	TimeSpentSeconds       int        `json:"time_spent_seconds"`
	Status                 string     `json:"status"`
	AIInterviewInviteToken *string    `json:"ai_interview_invite_token,omitempty"`
	AIInterviewExpiresAt   *time.Time `json:"ai_interview_expires_at,omitempty"`
	NextStep               string     `json:"next_step,omitempty"`
	RedirectURL            string     `json:"redirect_url,omitempty"`
	PreviewToken           string     `json:"preview_token,omitempty"`
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

	orgSlug := "acme"
	if h.orgRepo != nil {
		if org, err := h.orgRepo.GetByID(r.Context(), program.OrganizationID); err == nil && org != nil {
			orgSlug = org.Slug
		}
	}

	previewTokenStr := ""
	if !program.IsOpen() && program.PreviewToken != uuid.Nil {
		previewTokenStr = program.PreviewToken.String()
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
	nextStep := ""
	redirectURL := ""

	if submission.Passed {
		interview, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), submission.ApplicantID)
		if err == nil && interview != nil {
			tokenStr := interview.InvitationToken
			inviteToken = &tokenStr
			inviteExpires = &interview.InvitationExpiresAt
		}

		flowNext := program.NextStepAfter(model.FlowStepMCQ)
		if flowNext == model.FlowStepAIInterview && !program.EnableAIInterview {
			flowNext = program.NextStepAfter(model.FlowStepAIInterview)
		}

		switch flowNext {
		case model.FlowStepAIInterview:
			nextStep = "ai_interview"
			if inviteToken != nil {
				redirectURL = fmt.Sprintf("/interview/%s", *inviteToken)
			}
		case model.FlowStepForm:
			if !applicant.FormSubmitted {
				nextStep = "fill_form"
				if previewTokenStr != "" {
					redirectURL = fmt.Sprintf("/programs/%s/%s/apply?preview=%s", orgSlug, program.Slug, previewTokenStr)
				} else {
					redirectURL = fmt.Sprintf("/programs/%s/%s/apply", orgSlug, program.Slug)
				}
			} else {
				afterForm := program.NextStepAfter(model.FlowStepForm)
				if afterForm == model.FlowStepAIInterview && program.EnableAIInterview {
					nextStep = "ai_interview"
					if inviteToken != nil {
						redirectURL = fmt.Sprintf("/interview/%s", *inviteToken)
					}
				} else {
					nextStep = "completed"
				}
			}
		default:
			nextStep = "completed"
		}
	}

	httpx.JSON(w, http.StatusOK, TestResultResponse{
		SubmissionID:           submission.ID.String(),
		ApplicantName:          applicant.FullName,
		CandidateEmail:         applicant.Email,
		ProgramName:            program.Name,
		OrgSlug:                orgSlug,
		ProgramSlug:            program.Slug,
		TrackName:              trackName,
		TotalScore:             submission.TotalScore,
		PassingScore:           passingScore,
		Passed:                 submission.Passed,
		TimeSpentSeconds:       submission.TimeSpentSeconds,
		Status:                 string(submission.Status),
		AIInterviewInviteToken: inviteToken,
		AIInterviewExpiresAt:   inviteExpires,
		NextStep:               nextStep,
		RedirectURL:            redirectURL,
		PreviewToken:           previewTokenStr,
	})
}
