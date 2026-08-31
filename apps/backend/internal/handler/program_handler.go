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

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type ProgramHandler struct {
	orgRepo         *repository.OrgRepository
	programRepo     *repository.ProgramRepository
	applicantRepo   *repository.ApplicantRepository
	submissionRepo  *repository.SubmissionRepository
	aiInterviewRepo *repository.AIInterviewRepository
}

func NewProgramHandler(
	orgRepo *repository.OrgRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	submissionRepo *repository.SubmissionRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
) *ProgramHandler {
	return &ProgramHandler{
		orgRepo:         orgRepo,
		programRepo:     programRepo,
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		aiInterviewRepo: aiInterviewRepo,
	}
}

type ProgramPublicResponse struct {
	Organization struct {
		ID      string `json:"id"`
		Slug    string `json:"slug"`
		Name    string `json:"name"`
		LogoURL string `json:"logo_url,omitempty"`
	} `json:"organization"`
	Program struct {
		ID                       string    `json:"id"`
		Slug                     string    `json:"slug"`
		Name                     string    `json:"name"`
		Description              string    `json:"description"`
		OpenDate                 time.Time `json:"open_date"`
		EndDate                  time.Time `json:"end_date"`
		EnableMCQ                bool      `json:"enable_mcq"`
		LogicTestDurationMinutes int       `json:"logic_test_duration_minutes"`
		LogicTestPassingScore    int       `json:"logic_test_passing_score"`
		AllowRetake              bool      `json:"allow_retake"`
		EnableAIInterview        bool      `json:"enable_ai_interview"`
		AIInterviewInstructions  string    `json:"ai_interview_instructions,omitempty"`
		AIInterviewQuestions     []string  `json:"ai_interview_questions,omitempty"`
		IsOpen                   bool      `json:"is_open"`
	} `json:"program"`
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
	resp.Program.OpenDate = program.OpenDate
	resp.Program.EndDate = program.EndDate
	resp.Program.EnableMCQ = program.EnableMCQ
	resp.Program.LogicTestDurationMinutes = program.LogicTestDurationMinutes
	resp.Program.LogicTestPassingScore = program.LogicTestPassingScore
	resp.Program.AllowRetake = program.AllowRetake
	resp.Program.EnableAIInterview = program.EnableAIInterview
	resp.Program.AIInterviewInstructions = program.AIInterviewInstructions
	resp.Program.AIInterviewQuestions = program.AIInterviewQuestions
	resp.Program.IsOpen = program.IsOpen()

	httpx.JSON(w, http.StatusOK, resp)
}

type ApplyRequest struct {
	FullName    string `json:"full_name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	GitHubURL   string `json:"github_url"`
	LinkedInURL string `json:"linkedin_url"`
	ResumeURL   string `json:"resume_url"`
	Notes       string `json:"notes"`
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

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.FullName = strings.TrimSpace(req.FullName)

	if req.Email == "" || req.FullName == "" {
		httpx.Error(w, http.StatusBadRequest, "full name and email are required")
		return
	}

	applicant, _, err := h.applicantRepo.CreateOrGet(r.Context(), &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      program.ID,
		Email:          req.Email,
		FullName:       req.FullName,
		Phone:          req.Phone,
		GitHubURL:      req.GitHubURL,
		LinkedInURL:    req.LinkedInURL,
		ResumeURL:      req.ResumeURL,
		CurrentStage:   model.StageTestInProgress,
		Notes:          req.Notes,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to record application")
		return
	}

	// If MCQ stage is disabled and AI Interview is enabled, direct straight to AI interview
	if !program.EnableMCQ && program.EnableAIInterview {
		aiToken := generateToken(24)
		expires := time.Now().Add(7 * 24 * time.Hour)
		ai, err := h.aiInterviewRepo.CreateInvitation(r.Context(), applicant.ID, program.ID, aiToken, expires)
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
			if !program.AllowRetake {
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
	newSub, err := h.submissionRepo.Create(r.Context(), applicant.ID, program.ID, testToken)
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
