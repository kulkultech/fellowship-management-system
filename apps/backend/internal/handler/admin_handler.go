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
	questionSetRepo *repository.QuestionSetRepository
	trackRepo       *repository.TrackRepository
	aiInterviewRepo *repository.AIInterviewRepository
	programRepo     *repository.ProgramRepository
	orgRepo         *repository.OrgRepository
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
) *AdminHandler {
	return &AdminHandler{
		applicantRepo:   applicantRepo,
		submissionRepo:  submissionRepo,
		mcqRepo:         mcqRepo,
		questionSetRepo: questionSetRepo,
		trackRepo:       trackRepo,
		aiInterviewRepo: aiInterviewRepo,
		programRepo:     programRepo,
		orgRepo:         orgRepo,
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

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message": "Applicant stage updated successfully",
		"stage":   req.Stage,
	})
}

func (h *AdminHandler) ListPrograms(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	var orgID uuid.UUID
	if ok && claims.OrganizationID != nil {
		orgID = *claims.OrganizationID
	}
	if orgID == uuid.Nil {
		orgID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	}

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
	claims, ok := middleware.GetUser(r.Context())
	var orgID uuid.UUID
	if ok && claims.OrganizationID != nil {
		orgID = *claims.OrganizationID
	}
	if orgID == uuid.Nil {
		orgID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
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
	QuestionSetID            *string  `json:"question_set_id,omitempty"`
	Slug                     string   `json:"slug"`
	Name                     string   `json:"name"`
	Description              string   `json:"description"`
	EnableMCQ                bool     `json:"enable_mcq"`
	LogicTestDurationMinutes int      `json:"logic_test_duration_minutes"`
	LogicTestPassingScore    int      `json:"logic_test_passing_score"`
	AllowRetake              bool     `json:"allow_retake"`
	EnableAIInterview        bool     `json:"enable_ai_interview"`
	AIInterviewInstructions  string   `json:"ai_interview_instructions"`
	AIInterviewQuestions     []string `json:"ai_interview_questions"`
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
	}

	updated, err := h.trackRepo.Update(r.Context(), track)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update track")
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
// Question Sets / Question Banks Multi-Set System
// --------------------------------------------------------------------------------

type CreateQuestionSetRequest struct {
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
	if ok && claims != nil && claims.OrganizationID != nil {
		orgUUID = claims.OrganizationID
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
		httpx.Error(w, http.StatusInternalServerError, "failed to create question set")
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

	var targetOrgID uuid.UUID
	if claims.OrganizationID != nil {
		targetOrgID = *claims.OrganizationID
	} else {
		// Fallback to default RSA org for superadmin or unassigned dev user
		targetOrgID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	}

	org, err := h.orgRepo.GetByID(r.Context(), targetOrgID)
	if err != nil {
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

	var targetOrgID uuid.UUID
	if claims.OrganizationID != nil {
		targetOrgID = *claims.OrganizationID
	} else {
		targetOrgID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	}

	var req UpdateOrgRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		return
	}

	org, err := h.orgRepo.Update(r.Context(), targetOrgID, req.Name, req.ContactEmail, req.LogoURL)
	if err != nil {
		httpx.JSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	httpx.JSON(w, http.StatusOK, org)
}
