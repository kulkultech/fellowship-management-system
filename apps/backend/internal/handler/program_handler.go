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

	"github.com/kulkul/backend/internal/httpx"
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
}

func NewProgramHandler(
	orgRepo *repository.OrgRepository,
	programRepo *repository.ProgramRepository,
	trackRepo *repository.TrackRepository,
	mcqRepo *repository.MCQRepository,
	applicantRepo *repository.ApplicantRepository,
	submissionRepo *repository.SubmissionRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
) *ProgramHandler {
	return &ProgramHandler{
		orgRepo:         orgRepo,
		programRepo:     programRepo,
		trackRepo:       trackRepo,
		mcqRepo:         mcqRepo,
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		aiInterviewRepo: aiInterviewRepo,
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
		AIInterviewInstructions  string                   `json:"ai_interview_instructions,omitempty"`
		AIInterviewQuestions     []string                 `json:"ai_interview_questions,omitempty"`
		ApplicationStages        []model.ApplicationStageItem `json:"application_stages"`
		IsOpen                   bool                     `json:"is_open"`
		Tracks                   []TrackPublicItem        `json:"tracks"`
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
	resp.Program.IsOpen = program.IsOpen()

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
	TrackSlug      string `json:"track_slug,omitempty"`
	TrackID        string `json:"track_id,omitempty"`
	ChosenCourse   string `json:"chosen_course,omitempty"`
	FirstName      string `json:"first_name"`
	LastName       string `json:"last_name"`
	FullName       string `json:"full_name"`
	DateOfBirth    string `json:"date_of_birth"`
	Phone          string `json:"phone"`
	Email          string `json:"email"`
	LinkedInURL    string `json:"linkedin_url"`
	University     string `json:"university"`
	Major          string `json:"major"`
	Semester       string `json:"semester"`
	ReferralSource string `json:"referral_source"`
	GitHubURL      string `json:"github_url"`
	ResumeURL      string `json:"resume_url"`
	Notes          string `json:"notes"`
}

type ApplyResponse struct {
	ApplicantID            string               `json:"applicant_id"`
	Stage                  model.ApplicantStage `json:"stage"`
	TestToken              string               `json:"test_token,omitempty"`
	AIInterviewInviteToken string               `json:"ai_interview_invite_token,omitempty"`
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

	if !program.IsOpen() {
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

	if req.FirstName == "" || req.LastName == "" || req.Email == "" || req.Phone == "" || req.DateOfBirth == "" || req.University == "" || req.Major == "" || req.Semester == "" || req.ReferralSource == "" {
		httpx.Error(w, http.StatusBadRequest, "all mandatory fields (First Name, Last Name, Date of Birth, Phone, Email, University, Major, Semester, Referral Source) must be filled")
		return
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
		OrganizationID: org.ID,
		ProgramID:      program.ID,
		TrackID:        trackIDPtr,
		Email:          req.Email,
		FullName:       req.FullName,
		FirstName:      req.FirstName,
		LastName:       req.LastName,
		DateOfBirth:    req.DateOfBirth,
		Phone:          req.Phone,
		GitHubURL:      req.GitHubURL,
		LinkedInURL:    req.LinkedInURL,
		ResumeURL:      req.ResumeURL,
		University:     req.University,
		Major:          req.Major,
		Semester:       req.Semester,
		ReferralSource: req.ReferralSource,
		CurrentStage:   model.StageTestInProgress,
		Notes:          req.Notes,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to record application")
		return
	}

	// If MCQ stage is disabled and AI Interview is enabled, direct straight to AI interview
	if !enableMCQ && enableAI {
		aiToken := generateToken(24)
		expires := time.Now().Add(7 * 24 * time.Hour)
		ai, err := h.aiInterviewRepo.CreateInvitationWithTrack(r.Context(), applicant.ID, program.ID, trackIDPtr, aiToken, expires)
		if err == nil && ai != nil {
			_ = h.applicantRepo.UpdateStage(r.Context(), applicant.ID, model.StageAIInterviewInvited)
			httpx.JSON(w, http.StatusCreated, ApplyResponse{
				ApplicantID:            applicant.ID.String(),
				Stage:                  model.StageAIInterviewInvited,
				AIInterviewInviteToken: ai.InvitationToken,
				Message:                "Application received. Proceed directly to the AI Technical Screening.",
			})
			return
		}
	}

	// Check if there is an existing active submission
	submission, err := h.submissionRepo.GetByApplicantID(r.Context(), applicant.ID)
	if err == nil && submission != nil {
		if submission.Status == model.SubmissionCompleted {
			if !allowRetake {
				httpx.JSON(w, http.StatusOK, ApplyResponse{
					ApplicantID: applicant.ID.String(),
					Stage:       applicant.CurrentStage,
					TestToken:   submission.TestToken,
					Message:     "You have already completed the assessment test.",
				})
				return
			}
		} else if submission.Status == model.SubmissionInProgress {
			httpx.JSON(w, http.StatusOK, ApplyResponse{
				ApplicantID: applicant.ID.String(),
				Stage:       applicant.CurrentStage,
				TestToken:   submission.TestToken,
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

	httpx.JSON(w, http.StatusCreated, ApplyResponse{
		ApplicantID: applicant.ID.String(),
		Stage:       model.StageTestInProgress,
		TestToken:   newSub.TestToken,
		Message:     "Application received. Proceed to the logic test.",
	})
}
