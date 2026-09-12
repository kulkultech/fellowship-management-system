package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AdminHandler struct {
	applicantRepo   *repository.ApplicantRepository
	submissionRepo  *repository.SubmissionRepository
	mcqRepo         *repository.MCQRepository
	questionSetRepo *repository.QuestionSetRepository
	trackRepo       *repository.TrackRepository
	aiInterviewRepo *repository.AIInterviewRepository
	programRepo     *repository.ProgramRepository
	orgRepo         *repository.OrgRepository
	userRepo        *repository.UserRepository
	emailSvc        email.Service
	frontendURL     string
}

func NewAdminHandler(
	applicantRepo *repository.ApplicantRepository,
	submissionRepo *repository.SubmissionRepository,
	mcqRepo *repository.MCQRepository,
	questionSetRepo *repository.QuestionSetRepository,
	trackRepo *repository.TrackRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
	programRepo *repository.ProgramRepository,
	orgRepo *repository.OrgRepository,
	userRepo *repository.UserRepository,
	emailSvc email.Service,
	frontendURL string,
) *AdminHandler {
	if frontendURL == "" {
		frontendURL = "https://fellowhire.kul.to"
	}
	return &AdminHandler{
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		mcqRepo:         mcqRepo,
		questionSetRepo: questionSetRepo,
		trackRepo:       trackRepo,
		aiInterviewRepo: aiInterviewRepo,
		programRepo:     programRepo,
		orgRepo:         orgRepo,
		userRepo:        userRepo,
		emailSvc:        emailSvc,
		frontendURL:     strings.TrimRight(frontendURL, "/"),
	}
}

type ApplicantListItem struct {
	ID               string               `json:"id"`
	FullName         string               `json:"full_name"`
	FirstName        string               `json:"first_name,omitempty"`
	LastName         string               `json:"last_name,omitempty"`
	DateOfBirth      string               `json:"date_of_birth,omitempty"`
	Email            string               `json:"email"`
	Phone            string               `json:"phone"`
	GitHubURL        string               `json:"github_url,omitempty"`
	LinkedInURL      string               `json:"linkedin_url,omitempty"`
	ResumeURL        string               `json:"resume_url,omitempty"`
	University       string               `json:"university,omitempty"`
	Major            string               `json:"major,omitempty"`
	Semester         string               `json:"semester,omitempty"`
	ReferralSource   string               `json:"referral_source,omitempty"`
	TrackID          string               `json:"track_id,omitempty"`
	TrackName        string               `json:"track_name,omitempty"`
	CurrentStage     model.ApplicantStage `json:"current_stage"`
	MCQScore         *int                 `json:"mcq_score,omitempty"`
	MCQPassed        *bool                `json:"mcq_passed,omitempty"`
	TimeSpentSeconds *int                 `json:"time_spent_seconds,omitempty"`
	AIScore          *int                 `json:"ai_score,omitempty"`
	AIRecommendation *string              `json:"ai_recommendation,omitempty"`
	CreatedAt        string               `json:"created_at"`
}

func (h *AdminHandler) ListApplicants(w http.ResponseWriter, r *http.Request) {
	programIDStr := r.URL.Query().Get("program_id")
	stageFilter := r.URL.Query().Get("stage")

	if programIDStr == "" {
		programIDStr = "00000000-0000-0000-0000-000000000003"
	}

	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program_id")
		return
	}

	applicants, err := h.applicantRepo.ListByProgram(r.Context(), programID, stageFilter)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load applicants")
		return
	}

	tracks, _ := h.trackRepo.ListByProgram(r.Context(), programID)
	trackMap := make(map[string]string)
	for _, t := range tracks {
		trackMap[t.ID.String()] = t.Name
	}

	list := make([]ApplicantListItem, 0, len(applicants))
	for _, a := range applicants {
		trackName := ""
		trackID := ""
		if a.TrackID != nil {
			trackID = a.TrackID.String()
			trackName = trackMap[trackID]
		}

		item := ApplicantListItem{
			ID:             a.ID.String(),
			FullName:       a.FullName,
			FirstName:      a.FirstName,
			LastName:       a.LastName,
			DateOfBirth:    a.DateOfBirth,
			Email:          a.Email,
			Phone:          a.Phone,
			GitHubURL:      a.GitHubURL,
			LinkedInURL:    a.LinkedInURL,
			ResumeURL:      a.ResumeURL,
			University:     a.University,
			Major:          a.Major,
			Semester:       a.Semester,
			ReferralSource: a.ReferralSource,
			TrackID:        trackID,
			TrackName:      trackName,
			CurrentStage:   a.CurrentStage,
			CreatedAt:      a.CreatedAt.Format("2006-01-02 15:04"),
		}

		if sub, err := h.submissionRepo.GetByApplicantID(r.Context(), a.ID); err == nil && sub != nil {
			score := sub.TotalScore
			passed := sub.Passed
			spent := sub.TimeSpentSeconds
			item.MCQScore = &score
			item.MCQPassed = &passed
			item.TimeSpentSeconds = &spent
		}

		if ai, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), a.ID); err == nil && ai != nil {
			score := ai.ScorecardScore
			item.AIScore = &score
			if ai.SummaryEvaluation != nil {
				rec := ai.SummaryEvaluation.Recommendation
				item.AIRecommendation = &rec
			}
		}

		list = append(list, item)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"applicants": list,
		"total":      len(list),
	})
}

func (h *AdminHandler) GetApplicantDetail(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	applicantID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}

	applicant, err := h.applicantRepo.GetByID(r.Context(), applicantID)
	if err != nil {
		if errors.Is(err, repository.ErrApplicantNotFound) {
			httpx.Error(w, http.StatusNotFound, "applicant not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load applicant")
		return
	}

	var trackDetail map[string]any
	if applicant.TrackID != nil {
		if t, err := h.trackRepo.GetByID(r.Context(), *applicant.TrackID); err == nil && t != nil {
			trackDetail = map[string]any{
				"id":          t.ID.String(),
				"slug":        t.Slug,
				"name":        t.Name,
				"description": t.Description,
			}
		}
	}

	var submissionDetail map[string]any
	if sub, err := h.submissionRepo.GetByApplicantID(r.Context(), applicant.ID); err == nil && sub != nil {
		var allQuestions []model.MCQQuestion
		if sub.TrackID != nil {
			allQuestions, _ = h.mcqRepo.ListByTrack(r.Context(), *sub.TrackID)
		}
		if len(allQuestions) == 0 {
			allQuestions, _ = h.mcqRepo.ListByProgram(r.Context(), sub.ProgramID)
		}

		qMap := make(map[string]model.MCQQuestion)
		for _, q := range allQuestions {
			qMap[q.ID.String()] = q
		}

		type ItemizedAnswer struct {
			QuestionID       string            `json:"question_id"`
			Category         string            `json:"category"`
			QuestionText     string            `json:"question_text"`
			Options          []model.MCQOption `json:"options"`
			SelectedOptionID string            `json:"selected_option_id"`
			CorrectOptionID  string            `json:"correct_option_id"`
			IsCorrect        bool              `json:"is_correct"`
			Explanation      string            `json:"explanation"`
			PointsAwarded    int               `json:"points_awarded"`
		}

		itemized := make([]ItemizedAnswer, 0, len(sub.Answers))
		for _, ans := range sub.Answers {
			qIDStr := ans.QuestionID.String()
			q, exists := qMap[qIDStr]
			if !exists {
				continue
			}
			isCorrect := ans.SelectedOptionID == q.CorrectOptionID
			pts := 0
			if isCorrect {
				pts = q.Points
			}
			itemized = append(itemized, ItemizedAnswer{
				QuestionID:       qIDStr,
				Category:         q.Category,
				QuestionText:     q.QuestionText,
				Options:          q.Options,
				SelectedOptionID: ans.SelectedOptionID,
				CorrectOptionID:  q.CorrectOptionID,
				IsCorrect:        isCorrect,
				Explanation:      q.Explanation,
				PointsAwarded:    pts,
			})
		}

		submissionDetail = map[string]any{
			"id":                 sub.ID.String(),
			"status":             sub.Status,
			"started_at":         sub.StartedAt,
			"submitted_at":       sub.SubmittedAt,
			"total_score":        sub.TotalScore,
			"passed":             sub.Passed,
			"time_spent_seconds": sub.TimeSpentSeconds,
			"answers":            itemized,
		}
	}

	var aiDetail any
	if ai, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), applicant.ID); err == nil && ai != nil {
		aiDetail = ai
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"applicant": map[string]any{
			"id":              applicant.ID.String(),
			"full_name":       applicant.FullName,
			"first_name":      applicant.FirstName,
			"last_name":       applicant.LastName,
			"date_of_birth":   applicant.DateOfBirth,
			"email":           applicant.Email,
			"phone":           applicant.Phone,
			"github_url":      applicant.GitHubURL,
			"linkedin_url":    applicant.LinkedInURL,
			"resume_url":      applicant.ResumeURL,
			"university":      applicant.University,
			"major":           applicant.Major,
			"semester":        applicant.Semester,
			"referral_source": applicant.ReferralSource,
			"current_stage":   applicant.CurrentStage,
			"notes":           applicant.Notes,
			"custom_responses": applicant.CustomResponses,
			"created_at":      applicant.CreatedAt.Format("2006-01-02 15:04:05"),
		},
		"track":      trackDetail,
		"submission": submissionDetail,
		"ai_screen":  aiDetail,
	})
}

type UpdateStageRequest struct {
	Stage model.ApplicantStage `json:"stage"`
}

func (h *AdminHandler) UpdateApplicantStage(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	applicantID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}

	var req UpdateStageRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.applicantRepo.UpdateStage(r.Context(), applicantID, req.Stage); err != nil {
		if errors.Is(err, repository.ErrApplicantNotFound) {
			httpx.Error(w, http.StatusNotFound, "applicant not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update applicant stage")
		return
	}

	if h.emailSvc != nil {
		if req.Stage == model.StageApprovedForLive {
			applicant, err := h.applicantRepo.GetByID(r.Context(), applicantID)
			if err == nil && applicant != nil && applicant.Email != "" {
				progName := "KulKul Fellowship"
				if prog, err := h.programRepo.GetByID(r.Context(), applicant.ProgramID); err == nil && prog != nil {
					progName = prog.Name
				}
				trackName := ""
				if applicant.TrackID != nil {
					if tr, err := h.trackRepo.GetByID(r.Context(), *applicant.TrackID); err == nil && tr != nil {
						trackName = tr.Name
					}
				}
				dashboardURL := fmt.Sprintf("%s", h.frontendURL)
				_ = h.emailSvc.SendFinalInterviewInvitationEmail(
					applicant.Email,
					applicant.FullName,
					progName,
					trackName,
					dashboardURL,
					applicant.Notes,
				)
			}
		} else if req.Stage == model.StageAIInterviewInvited {
			applicant, err := h.applicantRepo.GetByID(r.Context(), applicantID)
			if err == nil && applicant != nil && applicant.Email != "" {
				progName := "KulKul Fellowship"
				if prog, err := h.programRepo.GetByID(r.Context(), applicant.ProgramID); err == nil && prog != nil {
					progName = prog.Name
				}
				trackName := ""
				if applicant.TrackID != nil {
					if tr, err := h.trackRepo.GetByID(r.Context(), *applicant.TrackID); err == nil && tr != nil {
						trackName = tr.Name
					}
				}
				interview, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), applicantID)
				var inviteToken string
				var expiresAt time.Time
				if err == nil && interview != nil && interview.InvitationToken != "" {
					inviteToken = interview.InvitationToken
					expiresAt = interview.InvitationExpiresAt
				} else {
					tokenBytes := make([]byte, 16)
					_, _ = rand.Read(tokenBytes)
					inviteToken = hex.EncodeToString(tokenBytes)
					expiresAt = time.Now().Add(7 * 24 * time.Hour)
					_, _ = h.aiInterviewRepo.CreateInvitationWithTrack(
						r.Context(),
						applicant.ID,
						applicant.ProgramID,
						applicant.TrackID,
						inviteToken,
						expiresAt,
					)
				}
				interviewURL := fmt.Sprintf("%s/interview/%s", h.frontendURL, inviteToken)
				_ = h.emailSvc.SendAIInterviewInvitationEmail(
					applicant.Email,
					applicant.FullName,
					progName,
					trackName,
					interviewURL,
					expiresAt,
				)
			}
		}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "Applicant stage updated successfully",
		"stage":   req.Stage,
	})
}

func (h *AdminHandler) resolveOrgID(r *http.Request, claims *auth.Claims) (uuid.UUID, error) {
	ctx := r.Context()
	if claims != nil && claims.Role == model.RoleSuperadmin {
		// 1. If superadmin explicitly provided target org_id via query param or header
		targetOrgStr := strings.TrimSpace(r.URL.Query().Get("org_id"))
		if targetOrgStr == "" {
			targetOrgStr = strings.TrimSpace(r.URL.Query().Get("organization_id"))
		}
		if targetOrgStr == "" {
			targetOrgStr = strings.TrimSpace(r.FormValue("org_id"))
		}
		if targetOrgStr == "" {
			targetOrgStr = strings.TrimSpace(r.FormValue("organization_id"))
		}
		if targetOrgStr == "" {
			targetOrgStr = strings.TrimSpace(r.Header.Get("X-Organization-ID"))
		}
		if targetOrgStr != "" {
			if parsed, err := uuid.Parse(targetOrgStr); err == nil && parsed != uuid.Nil {
				if _, err := h.orgRepo.GetByID(ctx, parsed); err == nil {
					return parsed, nil
				}
			}
		}
		// 2. If claims has an org ID
		if claims.OrganizationID != nil && *claims.OrganizationID != uuid.Nil {
			if _, err := h.orgRepo.GetByID(ctx, *claims.OrganizationID); err == nil {
				return *claims.OrganizationID, nil
			}
		}
		// 3. Superadmin default: return primary seeded organization (or fallback to rsa slug)
		primaryID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
		if org, err := h.orgRepo.GetByID(ctx, primaryID); err == nil && org != nil {
			return org.ID, nil
		}
		org, err := h.orgRepo.GetBySlug(ctx, "rsa")
		if err == nil && org != nil && org.ID != uuid.Nil {
			return org.ID, nil
		}
		orgs, err := h.orgRepo.List(ctx, "")
		if err == nil && len(orgs) > 0 {
			return orgs[0].ID, nil
		}
		return uuid.MustParse("00000000-0000-0000-0000-000000000001"), nil
	}

	if claims != nil && claims.OrganizationID != nil && *claims.OrganizationID != uuid.Nil {
		if _, err := h.orgRepo.GetByID(ctx, *claims.OrganizationID); err == nil {
			return *claims.OrganizationID, nil
		}
	}
	// Fallback 1: Look up "rsa" default org
	org, err := h.orgRepo.GetBySlug(ctx, "rsa")
	if err == nil && org != nil && org.ID != uuid.Nil {
		return org.ID, nil
	}
	// Fallback 2: Get first org from repository
	orgs, err := h.orgRepo.List(ctx, "")
	if err == nil && len(orgs) > 0 {
		return orgs[0].ID, nil
	}
	// Fallback 3: In-memory fallback
	return uuid.MustParse("00000000-0000-0000-0000-000000000001"), nil
}

func (h *AdminHandler) ListPrograms(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUser(r.Context())
	orgID, _ := h.resolveOrgID(r, claims)

	programs, err := h.programRepo.ListByOrg(r.Context(), orgID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load programs")
		return
	}

	type ProgramWithTracks struct {
		model.Program
		Tracks []model.Track `json:"tracks"`
	}

	result := make([]ProgramWithTracks, 0, len(programs))
	for _, p := range programs {
		tracks, _ := h.trackRepo.ListByProgram(r.Context(), p.ID)
		result = append(result, ProgramWithTracks{
			Program: p,
			Tracks:  tracks,
		})
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"programs": result,
		"total":    len(result),
	})
}

type CreateProgramRequest struct {
	QuestionSetID            *uuid.UUID `json:"question_set_id,omitempty"`
	Slug                     string     `json:"slug"`
	Name                     string     `json:"name"`
	Description              string     `json:"description"`
	ImageURL                 string     `json:"image_url"`
	EnableMCQ                bool       `json:"enable_mcq"`
	LogicTestDurationMinutes int        `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int        `json:"logic_test_passing_score"`
	AllowRetake              bool       `json:"allow_retake"`
	EnableAIInterview        bool       `json:"enable_ai_interview"`
	AIInterviewInstructions  string     `json:"ai_interview_instructions"`
	AIInterviewQuestions     []string   `json:"ai_interview_questions"`
	OpenDate                 *time.Time `json:"open_date,omitempty"`
	EndDate                  *time.Time `json:"end_date,omitempty"`
	Status                   string     `json:"status,omitempty"`
}

func (h *AdminHandler) CreateProgram(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUser(r.Context())
	orgID, err := h.resolveOrgID(r, claims)
	if err != nil || orgID == uuid.Nil {
		httpx.Error(w, http.StatusBadRequest, "organization context not found")
		return
	}

	var req CreateProgramRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if strings.TrimSpace(req.Slug) == "" || strings.TrimSpace(req.Name) == "" {
		httpx.Error(w, http.StatusBadRequest, "slug and name are required")
		return
	}

	if req.LogicTestDurationMinutes <= 0 {
		req.LogicTestDurationMinutes = 30
	}
	if req.LogicTestPassingScore <= 0 || req.LogicTestPassingScore > 100 {
		req.LogicTestPassingScore = 70
	}
	if req.ImageURL == "" {
		req.ImageURL = "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80"
	}

	status := "published"
	if strings.TrimSpace(req.Status) != "" {
		status = strings.TrimSpace(req.Status)
	}

	openDate := time.Now()
	if req.OpenDate != nil && !req.OpenDate.IsZero() {
		openDate = *req.OpenDate
	}

	endDate := time.Now().Add(180 * 24 * time.Hour)
	if req.EndDate != nil && !req.EndDate.IsZero() {
		endDate = *req.EndDate
	}

	p := &model.Program{
		ID:                       uuid.New(),
		OrganizationID:           orgID,
		QuestionSetID:            req.QuestionSetID,
		Slug:                     strings.ToLower(strings.TrimSpace(req.Slug)),
		Name:                     req.Name,
		Description:              req.Description,
		ImageURL:                 req.ImageURL,
		OpenDate:                 openDate,
		EndDate:                  endDate,
		EnableMCQ:                req.EnableMCQ,
		LogicTestDurationMinutes: req.LogicTestDurationMinutes,
		LogicTestPassingScore:    req.LogicTestPassingScore,
		AllowRetake:              req.AllowRetake,
		EnableAIInterview:        req.EnableAIInterview,
		AIInterviewInstructions:  req.AIInterviewInstructions,
		AIInterviewQuestions:     req.AIInterviewQuestions,
		Status:                   status,
	}

	created, err := h.programRepo.Create(r.Context(), p)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create program: %v", err))
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) DeleteProgram(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	programID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	claims, _ := middleware.GetUser(r.Context())
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	prog, err := h.programRepo.GetByID(r.Context(), programID)
	if err != nil {
		if errors.Is(err, repository.ErrProgramNotFound) {
			httpx.Error(w, http.StatusNotFound, "program not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to check program")
		return
	}

	// Superadmin can delete any program across the system. Org admin can delete their org's programs.
	if claims.Role != model.RoleSuperadmin {
		orgID, _ := h.resolveOrgID(r, claims)
		if orgID == uuid.Nil && claims.OrganizationID != nil {
			orgID = *claims.OrganizationID
		}
		rsaOrgID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
		if orgID != uuid.Nil && prog.OrganizationID != orgID && prog.OrganizationID != rsaOrgID && orgID != rsaOrgID {
			httpx.Error(w, http.StatusForbidden, "unauthorized to delete program of another organization")
			return
		}
	}

	if err := h.programRepo.Delete(r.Context(), programID, uuid.Nil); err != nil {
		if errors.Is(err, repository.ErrProgramNotFound) {
			httpx.Error(w, http.StatusNotFound, "program not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to delete program: %v", err))
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "program deleted successfully",
		"id":      programID.String(),
	})
}

type UpdateProgramDetailsRequest struct {
	Slug                     string     `json:"slug"`
	Name                     string     `json:"name"`
	Description              string     `json:"description"`
	ImageURL                 string     `json:"image_url"`
	OpenDate                 *time.Time `json:"open_date,omitempty"`
	EndDate                  *time.Time `json:"end_date,omitempty"`
	Status                   string     `json:"status,omitempty"`
	QuestionSetID            *uuid.UUID `json:"question_set_id,omitempty"`
	EnableMCQ                *bool      `json:"enable_mcq,omitempty"`
	LogicTestDurationMinutes *int       `json:"logic_test_duration_minutes,omitempty"`
	LogicTestPassingScore    *int       `json:"logic_test_passing_score,omitempty"`
}

func (h *AdminHandler) UpdateProgramDetails(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req UpdateProgramDetailsRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	trimmedName := strings.TrimSpace(req.Name)
	if trimmedName == "" {
		httpx.Error(w, http.StatusBadRequest, "program name cannot be empty")
		return
	}

	updated, err := h.programRepo.UpdateDetails(
		r.Context(),
		id,
		strings.TrimSpace(req.Slug),
		trimmedName,
		strings.TrimSpace(req.Description),
		strings.TrimSpace(req.ImageURL),
		req.OpenDate,
		req.EndDate,
		strings.TrimSpace(req.Status),
	)
	if err != nil {
		if errors.Is(err, repository.ErrProgramNotFound) {
			httpx.Error(w, http.StatusNotFound, "program not found")
			return
		}
		if strings.Contains(err.Error(), "already in use") {
			httpx.JSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to update program details: %v", err))
		return
	}

	if req.EnableMCQ != nil || req.QuestionSetID != nil || req.LogicTestDurationMinutes != nil || req.LogicTestPassingScore != nil {
		duration := 30
		if req.LogicTestDurationMinutes != nil && *req.LogicTestDurationMinutes > 0 {
			duration = *req.LogicTestDurationMinutes
		} else if updated.LogicTestDurationMinutes > 0 {
			duration = updated.LogicTestDurationMinutes
		}

		passingScore := 70
		if req.LogicTestPassingScore != nil && *req.LogicTestPassingScore > 0 {
			passingScore = *req.LogicTestPassingScore
		} else if updated.LogicTestPassingScore > 0 {
			passingScore = updated.LogicTestPassingScore
		}

		enableMCQ := updated.EnableMCQ
		if req.EnableMCQ != nil {
			enableMCQ = *req.EnableMCQ
		}

		qSetID := updated.QuestionSetID
		if req.QuestionSetID != nil {
			qSetID = req.QuestionSetID
		}

		_, _ = h.programRepo.UpdateConfig(r.Context(), id, duration, passingScore, updated.AllowRetake)
		if updated.AIInterviewRubric != nil {
			if up, err := h.programRepo.UpdatePipelineWithRubric(r.Context(), id, qSetID, enableMCQ, updated.EnableAIInterview, updated.AIInterviewInstructions, updated.AIInterviewQuestions, updated.AIInterviewRubric); err == nil && up != nil {
				updated = up
			}
		} else {
			if up, err := h.programRepo.UpdatePipeline(r.Context(), id, qSetID, enableMCQ, updated.EnableAIInterview, updated.AIInterviewInstructions, updated.AIInterviewQuestions); err == nil && up != nil {
				updated = up
			}
		}
	}

	httpx.JSON(w, http.StatusOK, updated)
}

type UpdatePipelineConfigRequest struct {
	QuestionSetID            *uuid.UUID               `json:"question_set_id,omitempty"`
	EnableMCQ                bool                     `json:"enable_mcq"`
	LogicTestDurationMinutes int                      `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int                      `json:"logic_test_passing_score"`
	AllowRetake              bool                     `json:"allow_retake"`
	EnableAIInterview        bool                     `json:"enable_ai_interview"`
	AIInterviewInstructions  string                   `json:"ai_interview_instructions"`
	AIInterviewQuestions     []string                 `json:"ai_interview_questions"`
	AIInterviewRubric        *model.AIInterviewRubric `json:"ai_interview_rubric,omitempty"`
}

func (h *AdminHandler) UpdatePipelineConfig(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req UpdatePipelineConfigRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.LogicTestDurationMinutes <= 0 {
		req.LogicTestDurationMinutes = 30
	}
	if req.LogicTestPassingScore <= 0 || req.LogicTestPassingScore > 100 {
		req.LogicTestPassingScore = 70
	}

	// 1. Update basic duration and passing score
	_, _ = h.programRepo.UpdateConfig(r.Context(), id, req.LogicTestDurationMinutes, req.LogicTestPassingScore, req.AllowRetake)

	// Fetch existing program to avoid wiping existing instructions or rubric if not provided
	existing, _ := h.programRepo.GetByID(r.Context(), id)
	instructions := req.AIInterviewInstructions
	if instructions == "" && existing != nil {
		instructions = existing.AIInterviewInstructions
	}
	questions := req.AIInterviewQuestions
	if len(questions) == 0 && existing != nil && len(existing.AIInterviewQuestions) > 0 {
		questions = existing.AIInterviewQuestions
	}
	rubric := req.AIInterviewRubric
	if rubric == nil && existing != nil {
		rubric = existing.AIInterviewRubric
	}

	// 2. Update pipeline toggles, questions and rubric
	var updated *model.Program
	if rubric != nil {
		updated, err = h.programRepo.UpdatePipelineWithRubric(r.Context(), id, req.QuestionSetID, req.EnableMCQ, req.EnableAIInterview, instructions, questions, rubric)
	} else {
		updated, err = h.programRepo.UpdatePipeline(r.Context(), id, req.QuestionSetID, req.EnableMCQ, req.EnableAIInterview, instructions, questions)
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update pipeline config")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) UpdateProgramRubric(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req model.AIInterviewRubric
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := h.programRepo.UpdateRubric(r.Context(), id, &req)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update program rubric")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

type UpdateProgramStagesRequest struct {
	Stages []model.ApplicationStageItem `json:"stages"`
}

func (h *AdminHandler) UpdateProgramStages(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req UpdateProgramStagesRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := h.programRepo.UpdateStages(r.Context(), id, req.Stages)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update application stages")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) UpdateProgramFormSchema(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req model.ApplicationFormSchema
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := h.programRepo.UpdateFormSchema(r.Context(), id, &req)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update application form schema")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

// --------------------------------------------------------------------------------
// Track Management Endpoints
// --------------------------------------------------------------------------------

func (h *AdminHandler) ListProgramTracks(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	programID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	tracks, err := h.trackRepo.ListByProgram(r.Context(), programID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load tracks")
		return
	}

	type TrackWithCount struct {
		model.Track
		QuestionCount int `json:"question_count"`
	}

	res := make([]TrackWithCount, 0, len(tracks))
	for _, t := range tracks {
		questions, _ := h.mcqRepo.ListByTrack(r.Context(), t.ID)
		res = append(res, TrackWithCount{
			Track:         t,
			QuestionCount: len(questions),
		})
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"tracks": res,
		"total":  len(res),
	})
}

type CreateTrackRequest struct {
	QuestionSetID            *string                  `json:"question_set_id,omitempty"`
	Slug                     string                   `json:"slug"`
	Name                     string                   `json:"name"`
	Description              string                   `json:"description"`
	EnableMCQ                bool                     `json:"enable_mcq"`
	LogicTestDurationMinutes int                      `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int                      `json:"logic_test_passing_score"`
	AllowRetake              bool                     `json:"allow_retake"`
	EnableAIInterview        bool                     `json:"enable_ai_interview"`
	AIInterviewInstructions  string                   `json:"ai_interview_instructions"`
	AIInterviewQuestions     []string                 `json:"ai_interview_questions"`
	AIInterviewRubric        *model.AIInterviewRubric `json:"ai_interview_rubric,omitempty"`
}

func (h *AdminHandler) CreateProgramTrack(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	programID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req CreateTrackRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	name := strings.TrimSpace(req.Name)
	if slug == "" || name == "" {
		httpx.Error(w, http.StatusBadRequest, "track slug and name are required")
		return
	}

	if req.LogicTestDurationMinutes <= 0 {
		req.LogicTestDurationMinutes = 35
	}
	if req.LogicTestPassingScore <= 0 || req.LogicTestPassingScore > 100 {
		req.LogicTestPassingScore = 70
	}

	var qSetUUID *uuid.UUID
	if req.QuestionSetID != nil && *req.QuestionSetID != "" {
		if parsed, err := uuid.Parse(*req.QuestionSetID); err == nil && parsed != uuid.Nil {
			qSetUUID = &parsed
		}
	}

	track := &model.Track{
		ID:                       uuid.New(),
		ProgramID:                programID,
		QuestionSetID:            qSetUUID,
		Slug:                     slug,
		Name:                     name,
		Description:              req.Description,
		EnableMCQ:                req.EnableMCQ,
		LogicTestDurationMinutes: req.LogicTestDurationMinutes,
		LogicTestPassingScore:    req.LogicTestPassingScore,
		AllowRetake:              req.AllowRetake,
		EnableAIInterview:        req.EnableAIInterview,
		AIInterviewInstructions:  req.AIInterviewInstructions,
		AIInterviewQuestions:     req.AIInterviewQuestions,
		AIInterviewRubric:        req.AIInterviewRubric,
	}

	created, err := h.trackRepo.Create(r.Context(), track)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create track")
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateTrack(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	trackID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid track id")
		return
	}

	var req CreateTrackRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.LogicTestDurationMinutes <= 0 {
		req.LogicTestDurationMinutes = 35
	}
	if req.LogicTestPassingScore <= 0 || req.LogicTestPassingScore > 100 {
		req.LogicTestPassingScore = 70
	}

	var qSetUUID *uuid.UUID
	if req.QuestionSetID != nil && *req.QuestionSetID != "" {
		if parsed, err := uuid.Parse(*req.QuestionSetID); err == nil && parsed != uuid.Nil {
			qSetUUID = &parsed
		}
	}

	track := &model.Track{
		ID:                       trackID,
		QuestionSetID:            qSetUUID,
		Name:                     req.Name,
		Description:              req.Description,
		EnableMCQ:                req.EnableMCQ,
		LogicTestDurationMinutes: req.LogicTestDurationMinutes,
		LogicTestPassingScore:    req.LogicTestPassingScore,
		AllowRetake:              req.AllowRetake,
		EnableAIInterview:        req.EnableAIInterview,
		AIInterviewInstructions:  req.AIInterviewInstructions,
		AIInterviewQuestions:     req.AIInterviewQuestions,
		AIInterviewRubric:        req.AIInterviewRubric,
	}

	updated, err := h.trackRepo.Update(r.Context(), track)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update track")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) UpdateTrackRubric(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	trackID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid track id")
		return
	}

	var req model.AIInterviewRubric
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := h.trackRepo.UpdateRubric(r.Context(), trackID, &req)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update track rubric")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) DeleteTrack(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	trackID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid track id")
		return
	}

	if err := h.trackRepo.Delete(r.Context(), trackID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete track")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"message": "Track deleted successfully"})
}

func (h *AdminHandler) ListTrackQuestions(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	trackID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid track id")
		return
	}

	questions, err := h.mcqRepo.ListByTrack(r.Context(), trackID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load track questions")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"questions": questions,
		"total":     len(questions),
	})
}

func (h *AdminHandler) SaveTrackQuestions(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	trackID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid track id")
		return
	}

	track, err := h.trackRepo.GetByID(r.Context(), trackID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "track not found")
		return
	}

	var req SaveQuestionsRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	saved, err := h.mcqRepo.ReplaceTrackQuestions(r.Context(), track.ProgramID, trackID, req.Questions)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save track questions")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":   "Track question bank updated successfully",
		"questions": saved,
		"total":     len(saved),
	})
}

// --------------------------------------------------------------------------------
// Program Question Builder (Google Form Style Questions)
// --------------------------------------------------------------------------------

func (h *AdminHandler) ListProgramQuestions(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	programID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	questions, err := h.mcqRepo.ListByProgram(r.Context(), programID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load questions")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"questions": questions,
		"total":     len(questions),
	})
}

type SaveQuestionsRequest struct {
	Questions []model.MCQQuestion `json:"questions"`
}

func (h *AdminHandler) SaveProgramQuestions(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	programID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req SaveQuestionsRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	saved, err := h.mcqRepo.ReplaceProgramQuestions(r.Context(), programID, req.Questions)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save questions")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":   "Question bank updated successfully",
		"questions": saved,
		"total":     len(saved),
	})
}

// --------------------------------------------------------------------------------
// Superadmin Company Approvals Workflow
// --------------------------------------------------------------------------------

func (h *AdminHandler) ListCompanies(w http.ResponseWriter, r *http.Request) {
	statusFilter := r.URL.Query().Get("status")
	orgs, err := h.orgRepo.List(r.Context(), statusFilter)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list companies")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"companies": orgs,
		"total":     len(orgs),
	})
}

func (h *AdminHandler) ApproveCompany(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	orgID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid company id")
		return
	}

	updated, err := h.orgRepo.UpdateStatus(r.Context(), orgID, model.OrgStatusApproved)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to approve company")
		return
	}

	if h.emailSvc != nil && updated != nil && updated.ContactEmail != "" {
		loginURL := fmt.Sprintf("%s/admin/login", h.frontendURL)
		_ = h.emailSvc.SendCompanyApprovedEmail(
			updated.ContactEmail,
			updated.Name,
			updated.Name,
			loginURL,
		)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "Company approved successfully",
		"company": updated,
	})
}

func (h *AdminHandler) RejectCompany(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	orgID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid company id")
		return
	}

	updated, err := h.orgRepo.UpdateStatus(r.Context(), orgID, model.OrgStatusRejected)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to reject company")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "Company application rejected",
		"company": updated,
	})
}

// --------------------------------------------------------------------------------
// Superadmin: User Access Lookup & Repair (generic, no hardcoded accounts)
// --------------------------------------------------------------------------------

func (h *AdminHandler) LookupUser(w http.ResponseWriter, r *http.Request) {
	email := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("email")))
	if email == "" {
		httpx.Error(w, http.StatusBadRequest, "email query parameter is required")
		return
	}

	u, err := h.userRepo.GetByEmail(r.Context(), email)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "user not found")
		return
	}

	var org *model.Organization
	if u.OrganizationID != nil {
		org, _ = h.orgRepo.GetByID(r.Context(), *u.OrganizationID)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"user":         publicUserPayload(u),
		"organization": org,
	})
}

type RelinkUserRequest struct {
	Email   string `json:"email"`
	OrgSlug string `json:"org_slug"`
}

func (h *AdminHandler) RelinkUser(w http.ResponseWriter, r *http.Request) {
	var req RelinkUserRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	slug := strings.ToLower(strings.TrimSpace(req.OrgSlug))
	if email == "" || slug == "" {
		httpx.Error(w, http.StatusBadRequest, "email and org_slug are required")
		return
	}

	u, err := h.userRepo.GetByEmail(r.Context(), email)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "user not found")
		return
	}

	org, err := h.orgRepo.GetBySlug(r.Context(), slug)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "company not found")
		return
	}

	if err := h.userRepo.UpdateOrgAndRole(r.Context(), u.ID, &org.ID, "org_admin", ""); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to relink user account")
		return
	}
	u.OrganizationID = &org.ID
	u.Role = "org_admin"

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":      "User relinked as company admin. They must log out and log in again for the new role to take effect.",
		"user":         publicUserPayload(u),
		"organization": org,
	})
}

func publicUserPayload(u *model.User) map[string]any {
	if u == nil {
		return nil
	}
	var orgID *string
	if u.OrganizationID != nil {
		s := u.OrganizationID.String()
		orgID = &s
	}
	return map[string]any{
		"id":              u.ID.String(),
		"email":           u.Email,
		"name":            u.Name,
		"role":            u.Role,
		"organization_id": orgID,
		"created_at":      u.CreatedAt,
		"updated_at":      u.UpdatedAt,
	}
}

// --------------------------------------------------------------------------------
// Question Sets / Question Banks Multi-Set System
// --------------------------------------------------------------------------------

type CreateQuestionSetRequest struct {
	OrganizationID  *string             `json:"organization_id,omitempty"`
	ProgramID       *string             `json:"program_id,omitempty"`
	Name            string              `json:"name"`
	Description     string              `json:"description,omitempty"`
	Category        string              `json:"category"`
	DurationMinutes int                 `json:"duration_minutes"`
	PassingScore    int                 `json:"passing_score"`
	Questions       []model.MCQQuestion `json:"questions,omitempty"`
}

type UpdateQuestionSetRequest struct {
	Name            string              `json:"name"`
	Description     string              `json:"description,omitempty"`
	Category        string              `json:"category"`
	DurationMinutes int                 `json:"duration_minutes"`
	PassingScore    int                 `json:"passing_score"`
	Questions       []model.MCQQuestion `json:"questions,omitempty"`
}

func (h *AdminHandler) ListQuestionSets(w http.ResponseWriter, r *http.Request) {
	var progUUID *uuid.UUID
	if progIDStr := r.URL.Query().Get("program_id"); progIDStr != "" {
		if parsed, err := uuid.Parse(progIDStr); err == nil {
			progUUID = &parsed
		}
	}

	claims, ok := middleware.GetUser(r.Context())
	var orgUUID *uuid.UUID
	if ok && claims != nil && claims.OrganizationID != nil {
		orgUUID = claims.OrganizationID
	}

	// For superadmin, allow filtering by ?org_id= or ?organization_id=
	if claims != nil && (claims.Role == "superadmin" || claims.OrganizationID == nil) {
		if queryOrg := r.URL.Query().Get("org_id"); queryOrg != "" {
			if parsed, err := uuid.Parse(queryOrg); err == nil {
				orgUUID = &parsed
			}
		} else if queryOrg := r.URL.Query().Get("organization_id"); queryOrg != "" {
			if parsed, err := uuid.Parse(queryOrg); err == nil {
				orgUUID = &parsed
			}
		}
	}

	sets, err := h.questionSetRepo.List(r.Context(), progUUID, orgUUID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list question sets")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"question_sets": sets,
		"total":         len(sets),
	})
}

func (h *AdminHandler) GetQuestionSet(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	setID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid question set id")
		return
	}

	set, err := h.questionSetRepo.GetByID(r.Context(), setID)
	if err != nil {
		if errors.Is(err, repository.ErrQuestionSetNotFound) {
			httpx.Error(w, http.StatusNotFound, "question set not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch question set")
		return
	}

	httpx.JSON(w, http.StatusOK, set)
}

func (h *AdminHandler) CreateQuestionSet(w http.ResponseWriter, r *http.Request) {
	var req CreateQuestionSetRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "question set name is required")
		return
	}

	var progUUID *uuid.UUID
	if req.ProgramID != nil && *req.ProgramID != "" {
		if parsed, err := uuid.Parse(*req.ProgramID); err == nil {
			progUUID = &parsed
		}
	}

	claims, ok := middleware.GetUser(r.Context())
	var orgUUID *uuid.UUID
	if req.OrganizationID != nil && strings.TrimSpace(*req.OrganizationID) != "" {
		if parsed, err := uuid.Parse(strings.TrimSpace(*req.OrganizationID)); err == nil && parsed != uuid.Nil {
			if _, err := h.orgRepo.GetByID(r.Context(), parsed); err == nil {
				orgUUID = &parsed
			}
		}
	}
	if orgUUID == nil {
		if queryOrg := r.URL.Query().Get("org_id"); queryOrg != "" {
			if parsed, err := uuid.Parse(queryOrg); err == nil && parsed != uuid.Nil {
				if _, err := h.orgRepo.GetByID(r.Context(), parsed); err == nil {
					orgUUID = &parsed
				}
			}
		}
	}
	if orgUUID == nil && ok {
		resolved, err := h.resolveOrgID(r, claims)
		if err == nil && resolved != uuid.Nil {
			orgUUID = &resolved
		}
	}
	if orgUUID == nil {
		rsaOrg, err := h.orgRepo.GetBySlug(r.Context(), "rsa")
		if err == nil && rsaOrg != nil && rsaOrg.ID != uuid.Nil {
			orgUUID = &rsaOrg.ID
		} else {
			defaultID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
			orgUUID = &defaultID
		}
	}

	cat := strings.TrimSpace(req.Category)
	if cat == "" {
		cat = "General Logic"
	}
	dur := req.DurationMinutes
	if dur <= 0 {
		dur = 30
	}
	pass := req.PassingScore
	if pass <= 0 || pass > 100 {
		pass = 70
	}

	qs := &model.QuestionSet{
		ID:              uuid.New(),
		OrganizationID:  orgUUID,
		ProgramID:       progUUID,
		Name:            name,
		Description:     req.Description,
		Category:        cat,
		DurationMinutes: dur,
		PassingScore:    pass,
		Questions:       req.Questions,
	}

	created, err := h.questionSetRepo.Create(r.Context(), qs)
	if err != nil {
		slog.Error("failed to create question set", slog.Any("error", err), slog.Any("org_id", orgUUID))
		httpx.Error(w, http.StatusInternalServerError, "failed to create question set: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

func (h *AdminHandler) UpdateQuestionSet(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	setID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid question set id")
		return
	}

	var req UpdateQuestionSetRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "question set name is required")
		return
	}

	cat := strings.TrimSpace(req.Category)
	if cat == "" {
		cat = "General Logic"
	}
	dur := req.DurationMinutes
	if dur <= 0 {
		dur = 30
	}
	pass := req.PassingScore
	if pass <= 0 || pass > 100 {
		pass = 70
	}

	qs := &model.QuestionSet{
		ID:              setID,
		Name:            name,
		Description:     req.Description,
		Category:        cat,
		DurationMinutes: dur,
		PassingScore:    pass,
		Questions:       req.Questions,
	}

	updated, err := h.questionSetRepo.Update(r.Context(), qs)
	if err != nil {
		if errors.Is(err, repository.ErrQuestionSetNotFound) {
			httpx.Error(w, http.StatusNotFound, "question set not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update question set")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) DeleteQuestionSet(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	setID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid question set id")
		return
	}

	if err := h.questionSetRepo.Delete(r.Context(), setID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete question set")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "Question set deleted successfully",
	})
}

func (h *AdminHandler) DuplicateQuestionSet(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	setID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid question set id")
		return
	}

	dup, err := h.questionSetRepo.Duplicate(r.Context(), setID)
	if err != nil {
		if errors.Is(err, repository.ErrQuestionSetNotFound) {
			httpx.Error(w, http.StatusNotFound, "question set not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to duplicate question set")
		return
	}

	httpx.JSON(w, http.StatusCreated, dup)
}

type UpdateOrgRequest struct {
	Slug         string `json:"slug,omitempty"`
	Name         string `json:"name"`
	ContactEmail string `json:"contact_email"`
	LogoURL      string `json:"logo_url"`
}

func (h *AdminHandler) GetCurrentOrganization(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	targetOrgID, _ := h.resolveOrgID(r, claims)
	org, err := h.orgRepo.GetByID(r.Context(), targetOrgID)
	if err != nil {
		primaryID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
		if fallbackOrg, fErr := h.orgRepo.GetByID(r.Context(), primaryID); fErr == nil && fallbackOrg != nil {
			httpx.JSON(w, http.StatusOK, fallbackOrg)
			return
		}
		if fallbackOrg, fErr := h.orgRepo.GetBySlug(r.Context(), "rsa"); fErr == nil && fallbackOrg != nil {
			httpx.JSON(w, http.StatusOK, fallbackOrg)
			return
		}
		httpx.JSON(w, http.StatusNotFound, map[string]string{"error": "organization not found"})
		return
	}

	httpx.JSON(w, http.StatusOK, org)
}

func (h *AdminHandler) UpdateOrganization(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	targetOrgID, _ := h.resolveOrgID(r, claims)
	var req UpdateOrgRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		return
	}

	org, err := h.orgRepo.Update(r.Context(), targetOrgID, req.Slug, req.Name, req.ContactEmail, req.LogoURL)
	if err != nil {
		if strings.Contains(err.Error(), "already in use") {
			httpx.JSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		httpx.JSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	httpx.JSON(w, http.StatusOK, org)
}

func (h *AdminHandler) UpdateCompanyDetails(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil || claims.Role != model.RoleSuperadmin {
		httpx.JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized: superadmin access required"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetOrgID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid company id")
		return
	}

	var req UpdateOrgRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		return
	}

	org, err := h.orgRepo.Update(r.Context(), targetOrgID, req.Slug, req.Name, req.ContactEmail, req.LogoURL)
	if err != nil {
		if strings.Contains(err.Error(), "already in use") {
			httpx.JSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		httpx.JSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	httpx.JSON(w, http.StatusOK, org)
}

func (h *AdminHandler) ImportQuestionSetCSV(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	setID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid question set id")
		return
	}

	qs, err := h.questionSetRepo.GetByID(r.Context(), setID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "question set not found")
		return
	}

	var reader io.Reader
	if strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			httpx.Error(w, http.StatusBadRequest, "failed to parse multipart form: "+err.Error())
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			file, _, err = r.FormFile("csv")
		}
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "file or csv form field required")
			return
		}
		defer file.Close()
		reader = file
	} else {
		reader = r.Body
	}

	importResult, err := repository.ParseQuestionsFromCSV(reader, qs.Category)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "failed to parse CSV: "+err.Error())
		return
	}

	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = r.FormValue("mode")
	}
	if mode == "" {
		mode = "replace"
	}

	var finalQuestions []model.MCQQuestion
	if mode == "append" {
		existing := qs.Questions
		finalQuestions = append(existing, importResult.Questions...)
	} else {
		finalQuestions = importResult.Questions
	}

	saved, err := h.questionSetRepo.ReplaceQuestions(r.Context(), setID, qs.ProgramID, finalQuestions)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save questions: "+err.Error())
		return
	}

	qs.Questions = saved
	qs.TotalQuestions = len(saved)

	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"question_set":   qs,
		"imported_count": len(importResult.Questions),
		"total_count":    len(saved),
		"errors":         importResult.Errors,
	})
}

func (h *AdminHandler) CreateQuestionSetFromCSV(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var orgUUID *uuid.UUID
	if formOrg := r.FormValue("org_id"); formOrg != "" {
		if parsed, err := uuid.Parse(formOrg); err == nil && parsed != uuid.Nil {
			if _, err := h.orgRepo.GetByID(r.Context(), parsed); err == nil {
				orgUUID = &parsed
			}
		}
	}
	if orgUUID == nil {
		if queryOrg := r.URL.Query().Get("org_id"); queryOrg != "" {
			if parsed, err := uuid.Parse(queryOrg); err == nil && parsed != uuid.Nil {
				if _, err := h.orgRepo.GetByID(r.Context(), parsed); err == nil {
					orgUUID = &parsed
				}
			}
		}
	}
	if orgUUID == nil {
		resolved, err := h.resolveOrgID(r, claims)
		if err == nil && resolved != uuid.Nil {
			orgUUID = &resolved
		}
	}
	if orgUUID == nil {
		rsaOrg, err := h.orgRepo.GetBySlug(r.Context(), "rsa")
		if err == nil && rsaOrg != nil && rsaOrg.ID != uuid.Nil {
			orgUUID = &rsaOrg.ID
		} else {
			fallbackID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
			orgUUID = &fallbackID
		}
	}

	var reader io.Reader
	var filename string
	setName := r.FormValue("name")
	category := r.FormValue("category")
	durationStr := r.FormValue("duration_minutes")
	passingStr := r.FormValue("passing_score")

	if strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			httpx.Error(w, http.StatusBadRequest, "failed to parse multipart form: "+err.Error())
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			file, header, err = r.FormFile("csv")
		}
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "file or csv form field required")
			return
		}
		defer file.Close()
		reader = file
		if header != nil {
			filename = header.Filename
		}
	} else {
		reader = r.Body
	}

	if category == "" {
		category = "General Assessment"
	}

	importResult, err := repository.ParseQuestionsFromCSV(reader, category)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "failed to parse CSV: "+err.Error())
		return
	}

	if setName == "" {
		if filename != "" {
			setName = strings.TrimSuffix(filename, ".csv")
			setName = strings.TrimSuffix(setName, ".CSV")
		} else {
			setName = "Imported Question Bank"
		}
	}

	duration := 30
	if durationStr != "" {
		if d, err := strconv.Atoi(durationStr); err == nil && d > 0 {
			duration = d
		}
	}
	passingScore := 70
	if passingStr != "" {
		if p, err := strconv.Atoi(passingStr); err == nil && p > 0 && p <= 100 {
			passingScore = p
		}
	}

	newQS := &model.QuestionSet{
		ID:              uuid.New(),
		OrganizationID:  orgUUID,
		Name:            setName,
		Category:        category,
		DurationMinutes: duration,
		PassingScore:    passingScore,
		Questions:       importResult.Questions,
	}

	created, err := h.questionSetRepo.Create(r.Context(), newQS)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create question set: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]interface{}{
		"question_set":   created,
		"imported_count": len(importResult.Questions),
		"errors":         importResult.Errors,
	})
}

func (h *AdminHandler) DeleteCompany(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil || claims.Role != model.RoleSuperadmin {
		httpx.JSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: superadmin only"})
		return
	}

	idStr := chi.URLParam(r, "id")
	orgID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid company id")
		return
	}

	if orgID == uuid.MustParse("00000000-0000-0000-0000-000000000001") {
		httpx.Error(w, http.StatusBadRequest, "cannot delete primary system organization")
		return
	}

	if err := h.orgRepo.Delete(r.Context(), orgID); err != nil {
		if errors.Is(err, repository.ErrOrgNotFound) {
			httpx.Error(w, http.StatusNotFound, "company not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to delete company: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "company deleted successfully",
		"id":      orgID.String(),
	})
}


