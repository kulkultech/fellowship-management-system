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
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type ProgramHandler struct {
	orgRepo         *repository.OrgRepository
	programRepo     *repository.ProgramRepository
	trackRepo       *repository.TrackRepository
	mcqRepo         *repository.MCQRepository
	applicantRepo   *repository.ApplicantRepository
	submissionRepo  *repository.SubmissionRepository
	aiInterviewRepo *repository.AIInterviewRepository
	userRepo        *repository.UserRepository
	emailSvc        email.Service
	frontendURL     string
}

func NewProgramHandler(
	orgRepo *repository.OrgRepository,
	programRepo *repository.ProgramRepository,
	trackRepo *repository.TrackRepository,
	mcqRepo *repository.MCQRepository,
	applicantRepo *repository.ApplicantRepository,
	submissionRepo *repository.SubmissionRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
	userRepo *repository.UserRepository,
	emailSvc email.Service,
	frontendURL string,
) *ProgramHandler {
	if frontendURL == "" {
		frontendURL = "https://fellowhire.kul.to"
	}
	return &ProgramHandler{
		orgRepo:         orgRepo,
		programRepo:     programRepo,
		trackRepo:       trackRepo,
		mcqRepo:         mcqRepo,
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		aiInterviewRepo: aiInterviewRepo,
		userRepo:        userRepo,
		emailSvc:        emailSvc,
		frontendURL:     strings.TrimRight(frontendURL, "/"),
	}
}

type TrackPublicItem struct {
	ID                       string   `json:"id"`
	Slug                     string   `json:"slug"`
	Name                     string   `json:"name"`
	Description              string   `json:"description"`
	EnableMCQ                bool     `json:"enable_mcq"`
	LogicTestDurationMinutes int      `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int      `json:"logic_test_passing_score"`
	AllowRetake              bool     `json:"allow_retake"`
	EnableAIInterview        bool     `json:"enable_ai_interview"`
	AIInterviewInstructions  string   `json:"ai_interview_instructions,omitempty"`
	AIInterviewQuestions     []string `json:"ai_interview_questions,omitempty"`
	QuestionCount            int      `json:"question_count"`
}

type ProgramPublicResponse struct {
	Organization struct {
		ID      string `json:"id"`
		Slug    string `json:"slug"`
		Name    string `json:"name"`
		LogoURL string `json:"logo_url,omitempty"`
	} `json:"organization"`
	Program struct {
		ID                       string            `json:"id"`
		Slug                     string            `json:"slug"`
		Name                     string            `json:"name"`
		Description              string            `json:"description"`
		ImageURL                 string            `json:"image_url,omitempty"`
		OpenDate                 time.Time         `json:"open_date"`
		EndDate                  time.Time         `json:"end_date"`
		EnableMCQ                bool              `json:"enable_mcq"`
		LogicTestDurationMinutes int               `json:"logic_test_duration_minutes"`
		LogicTestPassingScore    int               `json:"logic_test_passing_score"`
		AllowRetake              bool              `json:"allow_retake"`
		EnableAIInterview        bool                     `json:"enable_ai_interview"`
		AIInterviewInstructions  string                       `json:"ai_interview_instructions,omitempty"`
		AIInterviewQuestions     []string                     `json:"ai_interview_questions,omitempty"`
		ApplicationStages        []model.ApplicationStageItem `json:"application_stages"`
		ApplicationFormSchema    *model.ApplicationFormSchema `json:"application_form_schema,omitempty"`
		CandidateFlow            []string                     `json:"candidate_flow"`
		IsOpen                   bool                         `json:"is_open"`
		PreviewToken             string                       `json:"preview_token,omitempty"`
		Tracks                   []TrackPublicItem            `json:"tracks"`
	} `json:"program"`
}

type TrackDetailPublicResponse struct {
	Organization struct {
		ID      string `json:"id"`
		Slug    string `json:"slug"`
		Name    string `json:"name"`
		LogoURL string `json:"logo_url,omitempty"`
	} `json:"organization"`
	Program struct {
		ID          string    `json:"id"`
		Slug        string    `json:"slug"`
		Name        string    `json:"name"`
		Description string    `json:"description"`
		ImageURL    string    `json:"image_url,omitempty"`
		OpenDate    time.Time `json:"open_date"`
		EndDate     time.Time `json:"end_date"`
		IsOpen      bool      `json:"is_open"`
	} `json:"program"`
	Track TrackPublicItem `json:"track"`
}

func (h *ProgramHandler) GetProgram(w http.ResponseWriter, r *http.Request) {
	orgSlug := chi.URLParam(r, "orgSlug")
	programSlug := chi.URLParam(r, "programSlug")

	program, org, err := h.programRepo.GetByOrgSlugAndProgramSlug(r.Context(), orgSlug, programSlug)
	if err != nil {
		if errors.Is(err, repository.ErrProgramNotFound) {
			httpx.Error(w, http.StatusNotFound, "program or organization not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load program")
		return
	}

	var resp ProgramPublicResponse
	resp.Organization.ID = org.ID.String()
	resp.Organization.Slug = org.Slug
	resp.Organization.Name = org.Name
	resp.Organization.LogoURL = org.LogoURL

	resp.Program.ID = program.ID.String()
	resp.Program.Slug = program.Slug
	resp.Program.Name = program.Name
	resp.Program.Description = program.Description
	resp.Program.ImageURL = program.ImageURL
	resp.Program.OpenDate = program.OpenDate
	resp.Program.EndDate = program.EndDate
	resp.Program.EnableMCQ = program.EnableMCQ
	resp.Program.LogicTestDurationMinutes = program.LogicTestDurationMinutes
	resp.Program.LogicTestPassingScore = program.LogicTestPassingScore
	resp.Program.AllowRetake = program.AllowRetake
	resp.Program.EnableAIInterview = program.EnableAIInterview
	resp.Program.AIInterviewInstructions = program.AIInterviewInstructions
	resp.Program.AIInterviewQuestions = program.AIInterviewQuestions
	resp.Program.ApplicationStages = program.ApplicationStages
	if len(resp.Program.ApplicationStages) == 0 {
		resp.Program.ApplicationStages = repository.DefaultApplicationStages()
	}
	resp.Program.ApplicationFormSchema = program.ApplicationFormSchema
	resp.Program.CandidateFlow = program.CandidateFlow
	if len(resp.Program.CandidateFlow) == 0 {
		resp.Program.CandidateFlow = model.DefaultCandidateFlow()
	}
	resp.Program.IsOpen = program.IsOpen()

	previewParam := r.URL.Query().Get("preview")
	claims, _ := middleware.GetUser(r.Context())
	isAdmin := claims != nil && (claims.Role == model.RoleOrgAdmin || claims.Role == model.RoleSuperadmin)
	if isAdmin || (previewParam != "" && previewParam == program.PreviewToken.String()) {
		resp.Program.PreviewToken = program.PreviewToken.String()
	}

	// Load tracks
	tracks, _ := h.trackRepo.ListByProgram(r.Context(), program.ID)
	resp.Program.Tracks = make([]TrackPublicItem, 0, len(tracks))
	for _, t := range tracks {
		questions, _ := h.mcqRepo.ListByTrack(r.Context(), t.ID)
		resp.Program.Tracks = append(resp.Program.Tracks, TrackPublicItem{
			ID:                       t.ID.String(),
			Slug:                     t.Slug,
			Name:                     t.Name,
			Description:              t.Description,
			EnableMCQ:                t.EnableMCQ,
			LogicTestDurationMinutes: t.LogicTestDurationMinutes,
			LogicTestPassingScore:    t.LogicTestPassingScore,
			AllowRetake:              t.AllowRetake,
			EnableAIInterview:        t.EnableAIInterview,
			AIInterviewInstructions:  t.AIInterviewInstructions,
			AIInterviewQuestions:     t.AIInterviewQuestions,
			QuestionCount:            len(questions),
		})
	}

	httpx.JSON(w, http.StatusOK, resp)
}

func (h *ProgramHandler) GetTrackDetail(w http.ResponseWriter, r *http.Request) {
	orgSlug := chi.URLParam(r, "orgSlug")
	programSlug := chi.URLParam(r, "programSlug")
	trackSlug := chi.URLParam(r, "trackSlug")

	program, org, err := h.programRepo.GetByOrgSlugAndProgramSlug(r.Context(), orgSlug, programSlug)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "program or organization not found")
		return
	}

	track, err := h.trackRepo.GetBySlug(r.Context(), program.ID, trackSlug)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "track not found")
		return
	}

	questions, _ := h.mcqRepo.ListByTrack(r.Context(), track.ID)

	var resp TrackDetailPublicResponse
	resp.Organization.ID = org.ID.String()
	resp.Organization.Slug = org.Slug
	resp.Organization.Name = org.Name
	resp.Organization.LogoURL = org.LogoURL

	resp.Program.ID = program.ID.String()
	resp.Program.Slug = program.Slug
	resp.Program.Name = program.Name
	resp.Program.Description = program.Description
	resp.Program.ImageURL = program.ImageURL
	resp.Program.OpenDate = program.OpenDate
	resp.Program.EndDate = program.EndDate
	resp.Program.IsOpen = program.IsOpen()

	resp.Track = TrackPublicItem{
		ID:                       track.ID.String(),
		Slug:                     track.Slug,
		Name:                     track.Name,
		Description:              track.Description,
		EnableMCQ:                track.EnableMCQ,
		LogicTestDurationMinutes: track.LogicTestDurationMinutes,
		LogicTestPassingScore:    track.LogicTestPassingScore,
		AllowRetake:              track.AllowRetake,
		EnableAIInterview:        track.EnableAIInterview,
		AIInterviewInstructions:  track.AIInterviewInstructions,
		AIInterviewQuestions:     track.AIInterviewQuestions,
		QuestionCount:            len(questions),
	}

	httpx.JSON(w, http.StatusOK, resp)
}

type ApplyRequest struct {
	TrackSlug         string                 `json:"track_slug,omitempty"`
	TrackID           string                 `json:"track_id,omitempty"`
	ChosenCourse      string                 `json:"chosen_course,omitempty"`
	FirstName         string                 `json:"first_name"`
	LastName          string                 `json:"last_name"`
	FullName          string                 `json:"full_name"`
	DateOfBirth       string                 `json:"date_of_birth"`
	Phone             string                 `json:"phone"`
	Email             string                 `json:"email"`
	LinkedInURL       string                 `json:"linkedin_url"`
	University        string                 `json:"university"`
	Major             string                 `json:"major"`
	Semester          string                 `json:"semester"`
	ReferralSource    string                 `json:"referral_source"`
	GitHubURL         string                 `json:"github_url"`
	ResumeURL         string                 `json:"resume_url"`
	ProfilePictureURL string                 `json:"profile_picture_url,omitempty"`
	Notes             string                 `json:"notes"`
	CustomResponses   map[string]interface{} `json:"custom_responses,omitempty"`
}

type ApplyResponse struct {
	ApplicantID            string               `json:"applicant_id"`
	Stage                  model.ApplicantStage `json:"stage"`
	TestToken              string               `json:"test_token,omitempty"`
	AIInterviewInviteToken string               `json:"ai_interview_invite_token,omitempty"`
	NextStep               string               `json:"next_step,omitempty"`
	RedirectURL            string               `json:"redirect_url,omitempty"`
	Message                string               `json:"message"`
}

func generateToken(length int) string {
	bytes := make([]byte, length)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (h *ProgramHandler) Apply(w http.ResponseWriter, r *http.Request) {
	orgSlug := chi.URLParam(r, "orgSlug")
	programSlug := chi.URLParam(r, "programSlug")
	trackSlugURL := chi.URLParam(r, "trackSlug")

	program, org, err := h.programRepo.GetByOrgSlugAndProgramSlug(r.Context(), orgSlug, programSlug)
	if err != nil {
		if errors.Is(err, repository.ErrProgramNotFound) {
			httpx.Error(w, http.StatusNotFound, "program or organization not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load program")
		return
	}

	previewParam := r.URL.Query().Get("preview")
	claims, _ := middleware.GetUser(r.Context())
	isAdmin := claims != nil && (claims.Role == model.RoleOrgAdmin || claims.Role == model.RoleSuperadmin)
	isPreviewAuthorized := (previewParam != "" && previewParam == program.PreviewToken.String()) || isAdmin

	if !program.IsOpen() && !isPreviewAuthorized {
		httpx.Error(w, http.StatusBadRequest, "applications for this program are currently closed")
		return
	}

	var req ApplyRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Phone = strings.TrimSpace(req.Phone)
	req.DateOfBirth = strings.TrimSpace(req.DateOfBirth)
	req.University = strings.TrimSpace(req.University)
	req.Major = strings.TrimSpace(req.Major)
	req.Semester = strings.TrimSpace(req.Semester)
	req.ReferralSource = strings.TrimSpace(req.ReferralSource)
	req.ChosenCourse = strings.TrimSpace(req.ChosenCourse)
	req.LinkedInURL = strings.TrimSpace(req.LinkedInURL)
	req.GitHubURL = strings.TrimSpace(req.GitHubURL)
	req.ResumeURL = strings.TrimSpace(req.ResumeURL)

	if req.FirstName == "" && req.FullName != "" {
		parts := strings.Fields(req.FullName)
		if len(parts) > 0 {
			req.FirstName = parts[0]
			if len(parts) > 1 {
				req.LastName = strings.Join(parts[1:], " ")
			}
		}
	}
	if req.FullName == "" {
		if req.FirstName != "" && req.LastName != "" {
			req.FullName = req.FirstName + " " + req.LastName
		} else if req.FirstName != "" {
			req.FullName = req.FirstName
		}
	}

	// Always require identity fields
	if req.FirstName == "" || req.LastName == "" || req.Email == "" {
		httpx.Error(w, http.StatusBadRequest, "First Name, Last Name, and Email are required")
		return
	}

	// Resolve schema for dynamic field requirements
	schema := program.ApplicationFormSchema
	if schema == nil {
		schema = model.DefaultStandardFormSchema()
	}

	type stdCheck struct {
		key   string
		val   string
		label string
	}
	stdChecks := []stdCheck{
		{"phone", req.Phone, "Phone Number"},
		{"date_of_birth", req.DateOfBirth, "Date of Birth"},
		{"university", req.University, "University"},
		{"major", req.Major, "Major"},
		{"semester", req.Semester, "Semester"},
		{"referral_source", req.ReferralSource, "Referral Source"},
		{"resume", req.ResumeURL, "Resume / CV"},
		{"linkedin_url", req.LinkedInURL, "LinkedIn Profile URL"},
		{"github_url", req.GitHubURL, "GitHub Profile URL"},
	}

	for _, sc := range stdChecks {
		if cfg, exists := schema.Fields[sc.key]; exists && cfg.Enabled && cfg.Required {
			if sc.val == "" {
				httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("%s is mandatory", sc.label))
				return
			}
		}
	}

	// Validate custom fields
	if req.CustomResponses == nil {
		req.CustomResponses = make(map[string]interface{})
	}
	for _, cf := range schema.CustomFields {
		if cf.Required {
			val, exists := req.CustomResponses[cf.ID]
			if !exists || val == nil || fmt.Sprintf("%v", val) == "" {
				httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("%s is mandatory", cf.Label))
				return
			}
		}
	}

	// Resolve Track
	var targetTrack *model.Track
	activeTrackSlug := trackSlugURL
	if activeTrackSlug == "" {
		if strings.EqualFold(req.ChosenCourse, "Full Stack Developer") || strings.EqualFold(req.ChosenCourse, "Fullstack") {
			activeTrackSlug = "fullstack"
		} else if strings.EqualFold(req.ChosenCourse, "QA Automation") || strings.EqualFold(req.ChosenCourse, "QA") {
			activeTrackSlug = "qa-automation"
		} else {
			activeTrackSlug = req.TrackSlug
		}
	}

	if activeTrackSlug != "" {
		targetTrack, _ = h.trackRepo.GetBySlug(r.Context(), program.ID, activeTrackSlug)
	} else if req.TrackID != "" {
		if tid, err := uuid.Parse(req.TrackID); err == nil {
			targetTrack, _ = h.trackRepo.GetByID(r.Context(), tid)
		}
	}

	// Fallback to first track if none matched
	if targetTrack == nil {
		if tracks, _ := h.trackRepo.ListByProgram(r.Context(), program.ID); len(tracks) > 0 {
			targetTrack = &tracks[0]
		}
	}

	var trackIDPtr *uuid.UUID
	enableMCQ := program.EnableMCQ
	enableAI := program.EnableAIInterview
	allowRetake := program.AllowRetake

	if targetTrack != nil {
		trackIDPtr = &targetTrack.ID
		enableMCQ = targetTrack.EnableMCQ
		enableAI = targetTrack.EnableAIInterview
		allowRetake = targetTrack.AllowRetake
	}

	applicant, _, err := h.applicantRepo.CreateOrGet(r.Context(), &model.Applicant{
		OrganizationID:    org.ID,
		ProgramID:         program.ID,
		TrackID:           trackIDPtr,
		Email:             req.Email,
		FullName:          req.FullName,
		FirstName:         req.FirstName,
		LastName:          req.LastName,
		DateOfBirth:       req.DateOfBirth,
		Phone:             req.Phone,
		GitHubURL:         req.GitHubURL,
		LinkedInURL:       req.LinkedInURL,
		ResumeURL:         req.ResumeURL,
		ProfilePictureURL: req.ProfilePictureURL,
		University:        req.University,
		Major:             req.Major,
		Semester:          req.Semester,
		ReferralSource:    req.ReferralSource,
		CurrentStage:      model.StageTestInProgress,
		FormSubmitted:     true,
		Notes:             req.Notes,
		CustomResponses:   req.CustomResponses,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to record application")
		return
	}

	_ = h.applicantRepo.SetFormSubmitted(r.Context(), applicant.ID, true)

	// Determine next step based on candidate_flow
	nextStep := program.NextStepAfter(model.FlowStepForm)
	if nextStep == model.FlowStepMCQ && !enableMCQ {
		nextStep = program.NextStepAfter(model.FlowStepMCQ)
	}
	if nextStep == model.FlowStepAIInterview && !enableAI {
		nextStep = program.NextStepAfter(model.FlowStepAIInterview)
	}

	switch nextStep {
	case model.FlowStepAIInterview:
		aiToken := generateToken(24)
		expires := time.Now().Add(7 * 24 * time.Hour)
		ai, err := h.aiInterviewRepo.CreateInvitationWithTrack(r.Context(), applicant.ID, program.ID, trackIDPtr, aiToken, expires)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create ai interview session: %v", err))
			return
		}
		_ = h.applicantRepo.UpdateStage(r.Context(), applicant.ID, model.StageAIInterviewInvited)
		if h.emailSvc != nil {
			trackName := ""
			if targetTrack != nil {
				trackName = targetTrack.Name
			}
			interviewURL := fmt.Sprintf("%s/interview/%s", h.frontendURL, ai.InvitationToken)
			_ = h.emailSvc.SendAIInterviewInvitationEmail(applicant.Email, applicant.FullName, program.Name, trackName, interviewURL, expires)
		}
		httpx.JSON(w, http.StatusCreated, ApplyResponse{
			ApplicantID:            applicant.ID.String(),
			Stage:                  model.StageAIInterviewInvited,
			AIInterviewInviteToken: ai.InvitationToken,
			NextStep:               "ai_interview",
			RedirectURL:            fmt.Sprintf("/interview/%s", ai.InvitationToken),
			Message:                "Application received. Proceed directly to the AI Technical Screening.",
		})
		return

	case model.FlowStepMCQ:
		// Check if there is an existing active submission
		submission, err := h.submissionRepo.GetByApplicantID(r.Context(), applicant.ID)
		if err == nil && submission != nil {
			if submission.Status == model.SubmissionCompleted {
				if !allowRetake {
					httpx.JSON(w, http.StatusOK, ApplyResponse{
						ApplicantID: applicant.ID.String(),
						Stage:       applicant.CurrentStage,
						TestToken:   submission.TestToken,
						NextStep:    "mcq_test",
						RedirectURL: fmt.Sprintf("/result/%s", submission.TestToken),
						Message:     "You have already completed the assessment test.",
					})
					return
				}
			} else if submission.Status == model.SubmissionInProgress {
				httpx.JSON(w, http.StatusOK, ApplyResponse{
					ApplicantID: applicant.ID.String(),
					Stage:       applicant.CurrentStage,
					TestToken:   submission.TestToken,
					NextStep:    "mcq_test",
					RedirectURL: fmt.Sprintf("/test/%s", submission.TestToken),
					Message:     "Resuming your test session.",
				})
				return
			}
		}

		// Create new test token & submission record
		testToken := generateToken(24)
		newSub, err := h.submissionRepo.CreateWithTrack(r.Context(), applicant.ID, program.ID, trackIDPtr, testToken)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to initialize test session: %v", err))
			return
		}

		_ = h.applicantRepo.UpdateStage(r.Context(), applicant.ID, model.StageTestInProgress)

		if h.emailSvc != nil {
			duration := program.LogicTestDurationMinutes
			passingScore := program.LogicTestPassingScore
			trackName := ""
			if targetTrack != nil {
				trackName = targetTrack.Name
				if targetTrack.LogicTestDurationMinutes > 0 {
					duration = targetTrack.LogicTestDurationMinutes
				}
				if targetTrack.LogicTestPassingScore > 0 {
					passingScore = targetTrack.LogicTestPassingScore
				}
			}
			testURL := fmt.Sprintf("%s/test/%s", h.frontendURL, newSub.TestToken)
			_ = h.emailSvc.SendApplicationReceivedEmail(applicant.Email, applicant.FullName, program.Name, trackName, testURL, duration, passingScore)
		}

		httpx.JSON(w, http.StatusCreated, ApplyResponse{
			ApplicantID: applicant.ID.String(),
			Stage:       model.StageTestInProgress,
			TestToken:   newSub.TestToken,
			NextStep:    "mcq_test",
			RedirectURL: fmt.Sprintf("/test/%s", newSub.TestToken),
			Message:     "Application received. Proceed to the logic test.",
		})
		return

	default: // completed / direct registration
		_ = h.applicantRepo.UpdateStage(r.Context(), applicant.ID, model.StageRegistered)
		httpx.JSON(w, http.StatusCreated, ApplyResponse{
			ApplicantID: applicant.ID.String(),
			Stage:       model.StageRegistered,
			NextStep:    "completed",
			Message:     "Application received successfully! Our admissions committee will review your profile.",
		})
		return
	}
}

type CandidateStatusResponse struct {
	Authenticated   bool     `json:"authenticated"`
	Email           string   `json:"email,omitempty"`
	HasApplied      bool     `json:"has_applied"`
	ApplicantID     string   `json:"applicant_id,omitempty"`
	TrackID         string   `json:"track_id,omitempty"`
	TrackSlug       string   `json:"track_slug,omitempty"`
	TrackName       string   `json:"track_name,omitempty"`
	EffectiveFlow   []string `json:"effective_flow"`
	CurrentStep     string   `json:"current_step"`
	CompletedSteps  []string `json:"completed_steps"`
	FormCompleted   bool     `json:"form_completed"`
	TestToken       string   `json:"test_token,omitempty"`
	TestStatus      string   `json:"test_status,omitempty"`
	TestPassed      bool     `json:"test_passed"`
	InterviewToken  string   `json:"interview_token,omitempty"`
	InterviewStatus string   `json:"interview_status,omitempty"`
	RedirectURL     string   `json:"redirect_url,omitempty"`
}

func (h *ProgramHandler) GetCandidateStatus(w http.ResponseWriter, r *http.Request) {
	orgSlug := chi.URLParam(r, "orgSlug")
	programSlug := chi.URLParam(r, "programSlug")

	program, org, err := h.programRepo.GetByOrgSlugAndProgramSlug(r.Context(), orgSlug, programSlug)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "program or organization not found")
		return
	}

	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.JSON(w, http.StatusOK, CandidateStatusResponse{
			Authenticated: false,
			EffectiveFlow: program.GetEffectiveCandidateFlow(),
			CurrentStep:   "google_signin",
		})
		return
	}

	effectiveFlow := program.GetEffectiveCandidateFlow()

	applicant, err := h.applicantRepo.GetByProgramAndEmail(r.Context(), program.ID, claims.Email)
	if err != nil || applicant == nil {
		firstStep := "completed"
		if len(effectiveFlow) > 0 {
			firstStep = effectiveFlow[0]
		}
		httpx.JSON(w, http.StatusOK, CandidateStatusResponse{
			Authenticated:  true,
			Email:          claims.Email,
			HasApplied:     false,
			EffectiveFlow:  effectiveFlow,
			CurrentStep:    firstStep,
			CompletedSteps: []string{},
		})
		return
	}

	trackIDStr := ""
	trackSlugStr := ""
	trackNameStr := ""
	if applicant.TrackID != nil {
		trackIDStr = applicant.TrackID.String()
		if tr, err := h.trackRepo.GetByID(r.Context(), *applicant.TrackID); err == nil && tr != nil {
			trackSlugStr = tr.Slug
			trackNameStr = tr.Name
		}
	}

	formCompleted := applicant.FormSubmitted
	mcqCompleted := false
	testPassed := false
	testToken := ""
	testStatus := ""

	sub, err := h.submissionRepo.GetByApplicantID(r.Context(), applicant.ID)
	if err == nil && sub != nil {
		testToken = sub.TestToken
		testStatus = string(sub.Status)
		testPassed = sub.Passed
		if sub.Status == model.SubmissionCompleted && sub.Passed {
			mcqCompleted = true
		}
	}

	aiCompleted := false
	interviewToken := ""
	interviewStatus := ""
	ai, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), applicant.ID)
	if err == nil && ai != nil {
		interviewToken = ai.InvitationToken
		interviewStatus = string(ai.Status)
		if ai.Status == model.AIInterviewCompleted {
			aiCompleted = true
		}
	}

	completedSteps := make([]string, 0, len(effectiveFlow))
	currentStep := "completed"
	redirectURL := ""

	for _, step := range effectiveFlow {
		switch step {
		case model.FlowStepMCQ:
			if mcqCompleted {
				completedSteps = append(completedSteps, step)
			} else if currentStep == "completed" {
				currentStep = step
				if testToken != "" {
					redirectURL = fmt.Sprintf("/test/%s", testToken)
				}
			}
		case model.FlowStepForm:
			if formCompleted {
				completedSteps = append(completedSteps, step)
			} else if currentStep == "completed" {
				currentStep = step
				redirectURL = fmt.Sprintf("/programs/%s/%s/apply", org.Slug, program.Slug)
			}
		case model.FlowStepAIInterview:
			if aiCompleted {
				completedSteps = append(completedSteps, step)
			} else if currentStep == "completed" {
				currentStep = step
				if interviewToken != "" {
					redirectURL = fmt.Sprintf("/interview/%s", interviewToken)
				}
			}
		}
	}

	httpx.JSON(w, http.StatusOK, CandidateStatusResponse{
		Authenticated:   true,
		Email:           claims.Email,
		HasApplied:      true,
		ApplicantID:     applicant.ID.String(),
		TrackID:         trackIDStr,
		TrackSlug:       trackSlugStr,
		TrackName:       trackNameStr,
		EffectiveFlow:   effectiveFlow,
		CurrentStep:     currentStep,
		CompletedSteps:  completedSteps,
		FormCompleted:   formCompleted,
		TestToken:       testToken,
		TestStatus:      testStatus,
		TestPassed:      testPassed,
		InterviewToken:  interviewToken,
		InterviewStatus: interviewStatus,
		RedirectURL:     redirectURL,
	})
}

type StartProgramRequest struct {
	TrackSlug string `json:"track_slug,omitempty"`
	TrackID   string `json:"track_id,omitempty"`
}

type StartProgramResponse struct {
	ApplicantID    string `json:"applicant_id"`
	CurrentStep    string `json:"current_step"`
	TestToken      string `json:"test_token,omitempty"`
	InterviewToken string `json:"interview_token,omitempty"`
	RedirectURL    string `json:"redirect_url"`
	Message        string `json:"message"`
}

func (h *ProgramHandler) StartProgram(w http.ResponseWriter, r *http.Request) {
	orgSlug := chi.URLParam(r, "orgSlug")
	programSlug := chi.URLParam(r, "programSlug")

	program, org, err := h.programRepo.GetByOrgSlugAndProgramSlug(r.Context(), orgSlug, programSlug)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "program or organization not found")
		return
	}

	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "sign in with Google is required to begin application")
		return
	}

	var req StartProgramRequest
	_ = httpx.Decode(w, r, &req)

	// Resolve target track if any
	var targetTrack *model.Track
	if req.TrackSlug != "" {
		targetTrack, _ = h.trackRepo.GetBySlug(r.Context(), program.ID, req.TrackSlug)
	} else if req.TrackID != "" {
		if tid, err := uuid.Parse(req.TrackID); err == nil {
			targetTrack, _ = h.trackRepo.GetByID(r.Context(), tid)
		}
	}
	if targetTrack == nil {
		if tracks, _ := h.trackRepo.ListByProgram(r.Context(), program.ID); len(tracks) > 0 {
			targetTrack = &tracks[0]
		}
	}

	var trackIDPtr *uuid.UUID
	enableMCQ := program.EnableMCQ
	enableAI := program.EnableAIInterview
	allowRetake := program.AllowRetake
	if targetTrack != nil {
		trackIDPtr = &targetTrack.ID
		enableMCQ = targetTrack.EnableMCQ
		enableAI = targetTrack.EnableAIInterview
		allowRetake = targetTrack.AllowRetake
	}

	fullName := claims.Email
	firstName := ""
	lastName := ""
	if h.userRepo != nil {
		if u, err := h.userRepo.GetByID(r.Context(), claims.UserID); err == nil && u != nil && u.Name != "" {
			fullName = u.Name
			parts := strings.Fields(u.Name)
			if len(parts) > 0 {
				firstName = parts[0]
				if len(parts) > 1 {
					lastName = strings.Join(parts[1:], " ")
				}
			}
		}
	}

	applicant, _, err := h.applicantRepo.CreateOrGet(r.Context(), &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      program.ID,
		TrackID:        trackIDPtr,
		Email:          claims.Email,
		FullName:       fullName,
		FirstName:      firstName,
		LastName:       lastName,
		CurrentStage:   model.StageTestInProgress,
		FormSubmitted:  false,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to register candidate session")
		return
	}

	effectiveFlow := program.GetEffectiveCandidateFlow()
	firstStep := "mcq_test"
	if len(effectiveFlow) > 0 {
		firstStep = effectiveFlow[0]
	}

	switch firstStep {
	case model.FlowStepMCQ:
		if !enableMCQ {
			next := program.NextStepAfter(model.FlowStepMCQ)
			if next == model.FlowStepForm {
				httpx.JSON(w, http.StatusOK, StartProgramResponse{
					ApplicantID: applicant.ID.String(),
					CurrentStep: "fill_form",
					RedirectURL: fmt.Sprintf("/programs/%s/%s/apply", org.Slug, program.Slug),
					Message:     "Please complete your application form.",
				})
				return
			}
		}

		sub, err := h.submissionRepo.GetByApplicantID(r.Context(), applicant.ID)
		if err == nil && sub != nil {
			if sub.Status == model.SubmissionCompleted && !allowRetake {
				httpx.JSON(w, http.StatusOK, StartProgramResponse{
					ApplicantID: applicant.ID.String(),
					CurrentStep: "mcq_test",
					TestToken:   sub.TestToken,
					RedirectURL: fmt.Sprintf("/result/%s", sub.TestToken),
					Message:     "You have already completed the logic assessment.",
				})
				return
			}
			if sub.Status == model.SubmissionInProgress {
				httpx.JSON(w, http.StatusOK, StartProgramResponse{
					ApplicantID: applicant.ID.String(),
					CurrentStep: "mcq_test",
					TestToken:   sub.TestToken,
					RedirectURL: fmt.Sprintf("/test/%s", sub.TestToken),
					Message:     "Resuming your assessment session.",
				})
				return
			}
		}

		testToken := generateToken(24)
		newSub, err := h.submissionRepo.CreateWithTrack(r.Context(), applicant.ID, program.ID, trackIDPtr, testToken)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to initialize test session")
			return
		}
		_ = h.applicantRepo.UpdateStage(r.Context(), applicant.ID, model.StageTestInProgress)

		if h.emailSvc != nil {
			duration := program.LogicTestDurationMinutes
			passingScore := program.LogicTestPassingScore
			trackName := ""
			if targetTrack != nil {
				trackName = targetTrack.Name
				if targetTrack.LogicTestDurationMinutes > 0 {
					duration = targetTrack.LogicTestDurationMinutes
				}
				if targetTrack.LogicTestPassingScore > 0 {
					passingScore = targetTrack.LogicTestPassingScore
				}
			}
			testURL := fmt.Sprintf("%s/test/%s", h.frontendURL, newSub.TestToken)
			_ = h.emailSvc.SendApplicationReceivedEmail(applicant.Email, applicant.FullName, program.Name, trackName, testURL, duration, passingScore)
		}

		httpx.JSON(w, http.StatusOK, StartProgramResponse{
			ApplicantID: applicant.ID.String(),
			CurrentStep: "mcq_test",
			TestToken:   newSub.TestToken,
			RedirectURL: fmt.Sprintf("/test/%s", newSub.TestToken),
			Message:     "Assessment session initiated. Proceed to the logic test.",
		})
		return

	case model.FlowStepAIInterview:
		if !enableAI {
			next := program.NextStepAfter(model.FlowStepAIInterview)
			if next == model.FlowStepForm {
				httpx.JSON(w, http.StatusOK, StartProgramResponse{
					ApplicantID: applicant.ID.String(),
					CurrentStep: "fill_form",
					RedirectURL: fmt.Sprintf("/programs/%s/%s/apply", org.Slug, program.Slug),
					Message:     "Please complete your application form.",
				})
				return
			}
		}
		aiToken := generateToken(24)
		expires := time.Now().Add(7 * 24 * time.Hour)
		ai, err := h.aiInterviewRepo.CreateInvitationWithTrack(r.Context(), applicant.ID, program.ID, trackIDPtr, aiToken, expires)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to initialize interview session")
			return
		}
		_ = h.applicantRepo.UpdateStage(r.Context(), applicant.ID, model.StageAIInterviewInvited)

		if h.emailSvc != nil {
			trackName := ""
			if targetTrack != nil {
				trackName = targetTrack.Name
			}
			interviewURL := fmt.Sprintf("%s/interview/%s", h.frontendURL, ai.InvitationToken)
			_ = h.emailSvc.SendAIInterviewInvitationEmail(applicant.Email, applicant.FullName, program.Name, trackName, interviewURL, expires)
		}

		httpx.JSON(w, http.StatusOK, StartProgramResponse{
			ApplicantID:    applicant.ID.String(),
			CurrentStep:    "ai_interview",
			InterviewToken: ai.InvitationToken,
			RedirectURL:    fmt.Sprintf("/interview/%s", ai.InvitationToken),
			Message:        "Proceed to AI Technical Screening.",
		})
		return

	default: // fill_form
		httpx.JSON(w, http.StatusOK, StartProgramResponse{
			ApplicantID: applicant.ID.String(),
			CurrentStep: "fill_form",
			RedirectURL: fmt.Sprintf("/programs/%s/%s/apply", org.Slug, program.Slug),
			Message:     "Please complete your application profile.",
		})
		return
	}
}

