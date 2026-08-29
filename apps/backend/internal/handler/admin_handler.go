package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AdminHandler struct {
	applicantRepo   *repository.ApplicantRepository
	submissionRepo  *repository.SubmissionRepository
	mcqRepo         *repository.MCQRepository
	aiInterviewRepo *repository.AIInterviewRepository
	programRepo     *repository.ProgramRepository
}

func NewAdminHandler(
	applicantRepo *repository.ApplicantRepository,
	submissionRepo *repository.SubmissionRepository,
	mcqRepo *repository.MCQRepository,
	aiInterviewRepo *repository.AIInterviewRepository,
	programRepo *repository.ProgramRepository,
) *AdminHandler {
	return &AdminHandler{
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		mcqRepo:         mcqRepo,
		aiInterviewRepo: aiInterviewRepo,
		programRepo:     programRepo,
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
		httpx.Error(w, http.StatusBadRequest, "program_id query parameter is required")
		return
	}

	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program_id")
		return
	}

	applicants, err := h.applicantRepo.ListByProgram(r.Context(), programID, stageFilter)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list applicants")
		return
	}

	result := make([]ApplicantListItem, 0, len(applicants))
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

		// Fetch test submission if exists
		sub, err := h.submissionRepo.GetByApplicantID(r.Context(), a.ID)
		if err == nil && sub != nil {
			score := sub.TotalScore
			passed := sub.Passed
			spent := sub.TimeSpentSeconds
			item.MCQScore = &score
			item.MCQPassed = &passed
			item.TimeSpentSeconds = &spent
		}

		// Fetch AI interview if exists
		ai, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), a.ID)
		if err == nil && ai != nil {
			score := ai.ScorecardScore
			item.AIScore = &score
			if ai.SummaryEvaluation != nil {
				rec := ai.SummaryEvaluation.Recommendation
				item.AIRecommendation = &rec
			}
		}

		result = append(result, item)
	}

	httpx.JSON(w, http.StatusOK, result)
}

type ItemizedQuestionAnswer struct {
	QuestionID       string            `json:"question_id"`
	Category         string            `json:"category"`
	QuestionText     string            `json:"question_text"`
	Options          []model.MCQOption `json:"options"`
	SelectedOptionID string            `json:"selected_option_id"`
	CorrectOptionID  string            `json:"correct_option_id"`
	IsCorrect        bool              `json:"is_correct"`
	Explanation      string            `json:"explanation"`
	Points           int               `json:"points"`
}

type ApplicantDetailResponse struct {
	Applicant       model.Applicant          `json:"applicant"`
	Submission      *model.TestSubmission    `json:"submission,omitempty"`
	ItemizedAnswers []ItemizedQuestionAnswer `json:"itemized_answers,omitempty"`
	AIInterview     *model.AIInterview       `json:"ai_interview,omitempty"`
}

func (h *AdminHandler) GetApplicantDetails(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}

	applicant, err := h.applicantRepo.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrApplicantNotFound) {
			httpx.Error(w, http.StatusNotFound, "applicant not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to get applicant")
		return
	}

	var resp ApplicantDetailResponse
	resp.Applicant = *applicant

	// Submission & Itemized answers
	sub, err := h.submissionRepo.GetByApplicantID(r.Context(), applicant.ID)
	if err == nil && sub != nil {
		resp.Submission = sub

		questions, err := h.mcqRepo.ListByProgram(r.Context(), applicant.ProgramID)
		if err == nil {
			answersMap := make(map[string]model.CandidateAnswer)
			for _, a := range sub.Answers {
				answersMap[a.QuestionID.String()] = a
			}

			itemized := make([]ItemizedQuestionAnswer, 0, len(questions))
			for _, q := range questions {
				qIDStr := q.ID.String()
				ans := answersMap[qIDStr]
				isCorrect := ans.IsCorrect != nil && *ans.IsCorrect

				itemized = append(itemized, ItemizedQuestionAnswer{
					QuestionID:       qIDStr,
					Category:         q.Category,
					QuestionText:     q.QuestionText,
					Options:          q.Options,
					SelectedOptionID: ans.SelectedOptionID,
					CorrectOptionID:  q.CorrectOptionID,
					IsCorrect:        isCorrect,
					Explanation:      q.Explanation,
					Points:           q.Points,
				})
			}
			resp.ItemizedAnswers = itemized
		}
	}

	// AI interview details
	ai, err := h.aiInterviewRepo.GetByApplicantID(r.Context(), applicant.ID)
	if err == nil && ai != nil {
		resp.AIInterview = ai
	}

	httpx.JSON(w, http.StatusOK, resp)
}

type DecisionRequest struct {
	Decision string `json:"decision"` // "approve" | "reject"
	Notes    string `json:"notes"`
}

func (h *AdminHandler) MakeDecision(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}

	var req DecisionRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	var targetStage model.ApplicantStage
	switch req.Decision {
	case "approve":
		targetStage = model.StageApprovedForLive
	case "reject":
		targetStage = model.StageRejected
	default:
		httpx.Error(w, http.StatusBadRequest, "decision must be 'approve' or 'reject'")
		return
	}

	if err := h.applicantRepo.UpdateStage(r.Context(), id, targetStage); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update applicant decision")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"applicant_id": id.String(),
		"new_stage":    targetStage,
		"message":      "Applicant decision successfully recorded",
	})
}

type CreateProgramRequest struct {
	Slug                     string `json:"slug"`
	Name                     string `json:"name"`
	Description              string `json:"description"`
	ImageURL                 string `json:"image_url"`
	LogicTestDurationMinutes int    `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int    `json:"logic_test_passing_score"`
	AllowRetake              bool   `json:"allow_retake"`
}

func (h *AdminHandler) ListPrograms(w http.ResponseWriter, r *http.Request) {
	// For demo/RSA admin, list programs
	orgID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	programs, err := h.programRepo.ListByOrg(r.Context(), orgID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list programs")
		return
	}
	httpx.JSON(w, http.StatusOK, programs)
}

func (h *AdminHandler) CreateProgram(w http.ResponseWriter, r *http.Request) {
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
	if req.LogicTestPassingScore <= 0 {
		req.LogicTestPassingScore = 70
	}
	if req.ImageURL == "" {
		req.ImageURL = "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80"
	}

	orgID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	p := &model.Program{
		ID:                       uuid.New(),
		OrganizationID:           orgID,
		Slug:                     req.Slug,
		Name:                     req.Name,
		Description:              req.Description,
		ImageURL:                 req.ImageURL,
		LogicTestDurationMinutes: req.LogicTestDurationMinutes,
		LogicTestPassingScore:    req.LogicTestPassingScore,
		AllowRetake:              req.AllowRetake,
		Status:                   "published",
	}

	created, err := h.programRepo.Create(r.Context(), p)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create program")
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

type UpdateProgramConfigRequest struct {
	LogicTestDurationMinutes int  `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int  `json:"logic_test_passing_score"`
	AllowRetake              bool `json:"allow_retake"`
}

func (h *AdminHandler) UpdateProgramConfig(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var req UpdateProgramConfigRequest
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

	updated, err := h.programRepo.UpdateConfig(r.Context(), id, req.LogicTestDurationMinutes, req.LogicTestPassingScore, req.AllowRetake)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update program config")
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

