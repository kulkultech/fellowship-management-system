package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AdminHandler struct {
	applicantRepo   *repository.ApplicantRepository
	submissionRepo  *repository.SubmissionRepository
	mcqRepo         *repository.MCQRepository
	aiInterviewRepo *repository.AIInterviewRepository
	programRepo     *repository.ProgramRepository
	orgRepo         *repository.OrgRepository
}

func NewAdminHandler(
	applicantRepo *repository.ApplicantRepository,
	submissionRepo *repository.SubmissionRepository,
	mcqRepo *repository.MCQRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
	programRepo *repository.ProgramRepository,
	orgRepo *repository.OrgRepository,
) *AdminHandler {
	return &AdminHandler{
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		mcqRepo:         mcqRepo,
		aiInterviewRepo: aiInterviewRepo,
		programRepo:     programRepo,
		orgRepo:         orgRepo,
	}
}

type ApplicantListItem struct {
	ID               string               `json:"id"`
	FullName         string               `json:"full_name"`
	Email            string               `json:"email"`
	Phone            string               `json:"phone"`
	GitHubURL        string               `json:"github_url"`
	LinkedInURL      string               `json:"linkedin_url"`
	ResumeURL        string               `json:"resume_url"`
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

	list := make([]ApplicantListItem, 0, len(applicants))
	for _, a := range applicants {
		item := ApplicantListItem{
			ID:           a.ID.String(),
			FullName:     a.FullName,
			Email:        a.Email,
			Phone:        a.Phone,
			GitHubURL:    a.GitHubURL,
			LinkedInURL:  a.LinkedInURL,
			ResumeURL:    a.ResumeURL,
			CurrentStage: a.CurrentStage,
			CreatedAt:    a.CreatedAt.Format("2006-01-02 15:04"),
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

	var submissionDetail map[string]any
	if sub, err := h.submissionRepo.GetByApplicantID(r.Context(), applicant.ID); err == nil && sub != nil {
		allQuestions, _ := h.mcqRepo.ListByProgram(r.Context(), sub.ProgramID)
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
		"applicant":    applicant,
		"submission":   submissionDetail,
		"ai_interview": aiDetail,
	})
}

type UpdateStageRequest struct {
	Stage model.ApplicantStage `json:"stage"`
	Notes string               `json:"notes,omitempty"`
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

	if req.Stage == "" {
		httpx.Error(w, http.StatusBadRequest, "stage is required")
		return
	}

	err = h.applicantRepo.UpdateStage(r.Context(), applicantID, req.Stage)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update stage")
		return
	}

	updated, _ := h.applicantRepo.GetByID(r.Context(), applicantID)
	httpx.JSON(w, http.StatusOK, updated)
}

func (h *AdminHandler) ListPrograms(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUser(r.Context())
	orgID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	if claims != nil && claims.OrganizationID != nil {
		orgID = *claims.OrganizationID
	}

	programs, err := h.programRepo.ListByOrg(r.Context(), orgID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list programs")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"programs": programs,
	})
}

type CreateProgramRequest struct {
	Slug                     string   `json:"slug"`
	Name                     string   `json:"name"`
	Description              string   `json:"description"`
	ImageURL                 string   `json:"image_url"`
	EnableMCQ                bool     `json:"enable_mcq"`
	LogicTestDurationMinutes int      `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int      `json:"logic_test_passing_score"`
	AllowRetake              bool     `json:"allow_retake"`
	EnableAIInterview        bool     `json:"enable_ai_interview"`
	AIInterviewInstructions  string   `json:"ai_interview_instructions"`
	AIInterviewQuestions     []string `json:"ai_interview_questions"`
}

func (h *AdminHandler) CreateProgram(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUser(r.Context())
	orgID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	if claims != nil && claims.OrganizationID != nil {
		orgID = *claims.OrganizationID
	}

	var req CreateProgramRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Slug == "" || req.Name == "" {
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

	p := &model.Program{
		ID:                       uuid.New(),
		OrganizationID:           orgID,
		Slug:                     strings.ToLower(strings.TrimSpace(req.Slug)),
		Name:                     req.Name,
		Description:              req.Description,
		ImageURL:                 req.ImageURL,
		EnableMCQ:                req.EnableMCQ,
		LogicTestDurationMinutes: req.LogicTestDurationMinutes,
		LogicTestPassingScore:    req.LogicTestPassingScore,
		AllowRetake:              req.AllowRetake,
		EnableAIInterview:        req.EnableAIInterview,
		AIInterviewInstructions:  req.AIInterviewInstructions,
		AIInterviewQuestions:     req.AIInterviewQuestions,
		Status:                   "published",
	}

	created, err := h.programRepo.Create(r.Context(), p)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create program")
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

type UpdatePipelineConfigRequest struct {
	EnableMCQ                bool     `json:"enable_mcq"`
	LogicTestDurationMinutes int      `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int      `json:"logic_test_passing_score"`
	AllowRetake              bool     `json:"allow_retake"`
	EnableAIInterview        bool     `json:"enable_ai_interview"`
	AIInterviewInstructions  string   `json:"ai_interview_instructions"`
	AIInterviewQuestions     []string `json:"ai_interview_questions"`
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

	// 2. Update pipeline toggles and questions
	updated, err := h.programRepo.UpdatePipeline(r.Context(), id, req.EnableMCQ, req.EnableAIInterview, req.AIInterviewInstructions, req.AIInterviewQuestions)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update pipeline config")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
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
