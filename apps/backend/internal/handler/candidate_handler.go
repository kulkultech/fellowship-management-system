package handler

import (
	"net/http"
	"strings"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type CandidateApplicationItem struct {
	ApplicantID      string               `json:"applicant_id"`
	Email            string               `json:"email"`
	FullName         string               `json:"full_name"`
	CurrentStage     model.ApplicantStage `json:"current_stage"`
	ProgramID        string               `json:"program_id"`
	ProgramSlug      string               `json:"program_slug"`
	ProgramName      string               `json:"program_name"`
	TrackID          string               `json:"track_id,omitempty"`
	TrackSlug        string               `json:"track_slug,omitempty"`
	TrackName        string               `json:"track_name,omitempty"`
	OrganizationID   string               `json:"organization_id"`
	OrgSlug          string               `json:"org_slug"`
	OrgName          string               `json:"org_name"`
	OrgLogoURL       string               `json:"org_logo_url,omitempty"`
	TestToken        string               `json:"test_token,omitempty"`
	TestScore        int                  `json:"test_score"`
	TestPassed       bool                 `json:"test_passed"`
	TestStatus       string               `json:"test_status,omitempty"`
	TimeSpentSeconds int                  `json:"time_spent_seconds"`
	InterviewToken   string               `json:"interview_token,omitempty"`
	InterviewStatus  string               `json:"interview_status,omitempty"`
	InterviewScore   int                  `json:"interview_score"`
	CreatedAt        string               `json:"created_at"`
}

type CandidateHandler struct {
	orgRepo         *repository.OrgRepository
	programRepo     *repository.ProgramRepository
	trackRepo       *repository.TrackRepository
	applicantRepo   *repository.ApplicantRepository
	submissionRepo  *repository.SubmissionRepository
	aiInterviewRepo *repository.AIInterviewRepository
}

func NewCandidateHandler(
	orgRepo *repository.OrgRepository,
	programRepo *repository.ProgramRepository,
	trackRepo *repository.TrackRepository,
	applicantRepo *repository.ApplicantRepository,
	submissionRepo *repository.SubmissionRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
) *CandidateHandler {
	return &CandidateHandler{
		orgRepo:         orgRepo,
		programRepo:     programRepo,
		trackRepo:       trackRepo,
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		aiInterviewRepo: aiInterviewRepo,
	}
}

func (h *CandidateHandler) GetCandidateApplications(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required to view candidate applications")
		return
	}

	targetEmail := strings.TrimSpace(strings.ToLower(claims.Email))

	// If superadmin, org_admin, or reviewer, allow filtering by explicit query email
	if claims.Role == "superadmin" || claims.Role == "org_admin" || claims.Role == "reviewer" {
		if queryEmail := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("email"))); queryEmail != "" {
			targetEmail = queryEmail
		}
	}

	if targetEmail == "" {
		httpx.Error(w, http.StatusBadRequest, "valid authenticated email is required")
		return
	}

	applicants, err := h.applicantRepo.ListByEmail(r.Context(), targetEmail)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch candidate applications")
		return
	}

	items := make([]CandidateApplicationItem, 0, len(applicants))
	for _, app := range applicants {
		program, err := h.programRepo.GetByID(r.Context(), app.ProgramID)
		if err != nil || program == nil {
			continue
		}
		org, _ := h.orgRepo.GetByID(r.Context(), app.OrganizationID)
		orgName := "Remote Skills Academy"
		orgSlug := "rsa"
		orgLogo := ""
		if org != nil {
			orgName = org.Name
			orgSlug = org.Slug
			orgLogo = org.LogoURL
		}

		trackID := ""
		trackSlug := ""
		trackName := ""
		if app.TrackID != nil {
			if tr, err := h.trackRepo.GetByID(r.Context(), *app.TrackID); err == nil && tr != nil {
				trackID = tr.ID.String()
				trackSlug = tr.Slug
				trackName = tr.Name
			}
		}

		item := CandidateApplicationItem{
			ApplicantID:    app.ID.String(),
			Email:          app.Email,
			FullName:       app.FullName,
			CurrentStage:   app.CurrentStage,
			ProgramID:      program.ID.String(),
			ProgramSlug:    program.Slug,
			ProgramName:    program.Name,
			TrackID:        trackID,
			TrackSlug:      trackSlug,
			TrackName:      trackName,
			OrganizationID: app.OrganizationID.String(),
			OrgSlug:        orgSlug,
			OrgName:        orgName,
			OrgLogoURL:     orgLogo,
			CreatedAt:      app.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}

		// Test submission
		sub, err := h.submissionRepo.GetByApplicantID(r.Context(), app.ID)
		if err == nil && sub != nil {
			item.TestToken = sub.TestToken
			item.TestScore = sub.TotalScore
			item.TestPassed = sub.Passed
			item.TestStatus = string(sub.Status)
			item.TimeSpentSeconds = sub.TimeSpentSeconds
		}

		// AI Interview
		ai, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), app.ID)
		if err == nil && ai != nil {
			item.InterviewToken = ai.InvitationToken
			item.InterviewStatus = string(ai.Status)
			item.InterviewScore = ai.ScorecardScore
		}

		items = append(items, item)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"email":        targetEmail,
		"applications": items,
	})
}
