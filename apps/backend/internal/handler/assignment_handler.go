package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type AssignmentHandler struct {
	assignmentRepo *repository.AssignmentRepository
	programRepo    *repository.ProgramRepository
	applicantRepo  *repository.ApplicantRepository
	mentorRepo     *repository.MentorRepository
	userRepo       *repository.UserRepository
}

func NewAssignmentHandler(
	assignmentRepo *repository.AssignmentRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	mentorRepo *repository.MentorRepository,
	userRepo *repository.UserRepository,
) *AssignmentHandler {
	return &AssignmentHandler{
		assignmentRepo: assignmentRepo,
		programRepo:    programRepo,
		applicantRepo:  applicantRepo,
		mentorRepo:     mentorRepo,
		userRepo:       userRepo,
	}
}

func (h *AssignmentHandler) canManageAssignments(r *http.Request, programID uuid.UUID) bool {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		return false
	}
	if claims.Role == model.RoleSuperadmin || claims.Role == model.RoleOrgAdmin || claims.Role == model.RoleReviewer {
		return true
	}
	if claims.Role == model.RoleMentor {
		if h.mentorRepo != nil {
			isAssigned, err := h.mentorRepo.IsMentorOfProgram(r.Context(), claims.UserID, programID)
			if err == nil && isAssigned {
				return true
			}
		}
	}
	return false
}

// ListAssignments handles GET /api/v1/programs/{programId}/assignments
func (h *AssignmentHandler) ListAssignments(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	var trackID *uuid.UUID
	trackIDStr := r.URL.Query().Get("track_id")
	if trackIDStr != "" {
		if tid, err := uuid.Parse(trackIDStr); err == nil {
			trackID = &tid
		}
	}

	claims, _ := middleware.GetUser(r.Context())
	var fellowApplicantID *uuid.UUID

	// If candidate/fellow is logged in, find their approved application
	if claims != nil && (claims.Role == model.RoleCandidate || claims.Role == "") {
		apps, err := h.applicantRepo.ListByEmail(r.Context(), claims.Email)
		if err == nil {
			for _, app := range apps {
				if app.ProgramID == programID && (app.CurrentStage == model.StageApprovedForLive || app.ProgramRoomInvitedAt != nil) {
					appID := app.ID
					fellowApplicantID = &appID
					if trackID == nil && app.TrackID != nil {
						trackID = app.TrackID
					}
					break
				}
			}
		}
	}

	assignments, err := h.assignmentRepo.ListAssignmentsByProgram(r.Context(), programID, trackID, fellowApplicantID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if assignments == nil {
		assignments = []*model.ProgramAssignment{}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"assignments": assignments,
		"count":       len(assignments),
	})
}

// GetAssignment handles GET /api/v1/programs/{programId}/assignments/{assignmentId}
func (h *AssignmentHandler) GetAssignment(w http.ResponseWriter, r *http.Request) {
	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
		return
	}

	assignment, err := h.assignmentRepo.GetAssignmentByID(r.Context(), assignmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			httpx.Error(w, http.StatusNotFound, "assignment not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Check if fellow is requesting
	claims, _ := middleware.GetUser(r.Context())
	if claims != nil && (claims.Role == model.RoleCandidate || claims.Role == "") {
		apps, err := h.applicantRepo.ListByEmail(r.Context(), claims.Email)
		if err == nil {
			for _, app := range apps {
				if app.ProgramID == assignment.ProgramID {
					sub, _ := h.assignmentRepo.GetSubmission(r.Context(), assignment.ID, app.ID)
					assignment.MySubmission = sub
					break
				}
			}
		}
	}

	httpx.JSON(w, http.StatusOK, assignment)
}

type CreateAssignmentRequest struct {
	TrackID            *uuid.UUID  `json:"track_id"`
	Title              string      `json:"title"`
	Description        string      `json:"description"`
	DueDate            *string     `json:"due_date"`
	MaxScore           int         `json:"max_score"`
	AttachmentURL      string      `json:"attachment_url"`
	AttachmentName     string      `json:"attachment_name"`
	Status             string      `json:"status"`
	TargetApplicantIDs []uuid.UUID `json:"target_applicant_ids"`
}

// CreateAssignment handles POST /api/v1/programs/{programId}/assignments
func (h *AssignmentHandler) CreateAssignment(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	if !h.canManageAssignments(r, programID) {
		httpx.Error(w, http.StatusForbidden, "you do not have permission to create assignments for this program")
		return
	}

	var req CreateAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "assignment title is required")
		return
	}

	claims, _ := middleware.GetUser(r.Context())
	var creatorID *uuid.UUID
	if claims != nil {
		creatorID = &claims.UserID
	}

	var dueTime *time.Time
	if req.DueDate != nil && *req.DueDate != "" {
		parsed, err := time.Parse(time.RFC3339, *req.DueDate)
		if err != nil {
			// Try secondary format (YYYY-MM-DDTHH:mm)
			parsed, err = time.Parse("2006-01-02T15:04", *req.DueDate)
			if err == nil {
				dueTime = &parsed
			}
		} else {
			dueTime = &parsed
		}
	}

	maxScore := req.MaxScore
	if maxScore <= 0 {
		maxScore = 100
	}

	status := model.AssignmentStatusPublished
	if req.Status != "" {
		status = model.AssignmentStatus(req.Status)
	}

	targetIDs := req.TargetApplicantIDs
	if targetIDs == nil {
		targetIDs = []uuid.UUID{}
	}

	assignment := &model.ProgramAssignment{
		ID:                 uuid.New(),
		ProgramID:          programID,
		TrackID:            req.TrackID,
		CreatorID:          creatorID,
		Title:              req.Title,
		Description:        req.Description,
		DueDate:            dueTime,
		MaxScore:           maxScore,
		AttachmentURL:      req.AttachmentURL,
		AttachmentName:     req.AttachmentName,
		Status:             status,
		TargetApplicantIDs: targetIDs,
	}

	created, err := h.assignmentRepo.CreateAssignment(r.Context(), assignment)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

// UpdateAssignment handles PUT /api/v1/programs/{programId}/assignments/{assignmentId}
func (h *AssignmentHandler) UpdateAssignment(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
		return
	}

	if !h.canManageAssignments(r, programID) {
		httpx.Error(w, http.StatusForbidden, "you do not have permission to update assignments for this program")
		return
	}

	existing, err := h.assignmentRepo.GetAssignmentByID(r.Context(), assignmentID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			httpx.Error(w, http.StatusNotFound, "assignment not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	var req CreateAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title != "" {
		existing.Title = req.Title
	}
	existing.Description = req.Description
	existing.TrackID = req.TrackID
	if req.MaxScore > 0 {
		existing.MaxScore = req.MaxScore
	}
	if req.AttachmentURL != "" {
		existing.AttachmentURL = req.AttachmentURL
		existing.AttachmentName = req.AttachmentName
	}
	if req.Status != "" {
		existing.Status = model.AssignmentStatus(req.Status)
	}

	if req.DueDate != nil && *req.DueDate != "" {
		parsed, err := time.Parse(time.RFC3339, *req.DueDate)
		if err != nil {
			parsed, err = time.Parse("2006-01-02T15:04", *req.DueDate)
			if err == nil {
				existing.DueDate = &parsed
			}
		} else {
			existing.DueDate = &parsed
		}
	} else if req.DueDate != nil && *req.DueDate == "" {
		existing.DueDate = nil
	}

	if req.TargetApplicantIDs != nil {
		existing.TargetApplicantIDs = req.TargetApplicantIDs
	}

	updated, err := h.assignmentRepo.UpdateAssignment(r.Context(), existing)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

// DeleteAssignment handles DELETE /api/v1/programs/{programId}/assignments/{assignmentId}
func (h *AssignmentHandler) DeleteAssignment(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
		return
	}

	if !h.canManageAssignments(r, programID) {
		httpx.Error(w, http.StatusForbidden, "you do not have permission to delete assignments for this program")
		return
	}

	if err := h.assignmentRepo.DeleteAssignment(r.Context(), assignmentID); err != nil {
		if errors.Is(err, repository.ErrAssignmentNotFound) {
			httpx.Error(w, http.StatusNotFound, "assignment not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{
		"message": "assignment deleted successfully",
	})
}

// ListSubmissions handles GET /api/v1/programs/{programId}/assignments/{assignmentId}/submissions
func (h *AssignmentHandler) ListSubmissions(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
		return
	}

	if !h.canManageAssignments(r, programID) {
		httpx.Error(w, http.StatusForbidden, "you do not have permission to view submissions for this program")
		return
	}

	subs, err := h.assignmentRepo.ListSubmissions(r.Context(), assignmentID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if subs == nil {
		subs = []*model.AssignmentSubmission{}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"submissions": subs,
		"count":       len(subs),
	})
}

type SubmitAssignmentRequest struct {
	FileURL   string `json:"file_url"`
	FileName  string `json:"file_name"`
	FileSize  int64  `json:"file_size"`
	GithubURL string `json:"github_url"`
	Notes     string `json:"notes"`
}

// SubmitAssignment handles POST /api/v1/programs/{programId}/assignments/{assignmentId}/submit
func (h *AssignmentHandler) SubmitAssignment(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
		return
	}

	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Verify assignment belongs to program
	assignment, err := h.assignmentRepo.GetAssignmentByID(r.Context(), assignmentID)
	if err != nil || assignment.ProgramID != programID {
		httpx.Error(w, http.StatusNotFound, "assignment not found for this program")
		return
	}

	// Find the applicant record for this fellow
	apps, err := h.applicantRepo.ListByEmail(r.Context(), claims.Email)
	if err != nil || len(apps) == 0 {
		httpx.Error(w, http.StatusForbidden, "candidate application record not found")
		return
	}

	var currentApp *model.Applicant
	for i := range apps {
		if apps[i].ProgramID == programID && (apps[i].CurrentStage == model.StageApprovedForLive || apps[i].ProgramRoomInvitedAt != nil) {
			currentApp = &apps[i]
			break
		}
	}
	if currentApp == nil {
		httpx.Error(w, http.StatusForbidden, "you are not an enrolled fellow in this program room")
		return
	}

	// Verify fellow is targeted for this assignment (if targeted)
	if len(assignment.TargetApplicantIDs) > 0 {
		isTargeted := false
		for _, tid := range assignment.TargetApplicantIDs {
			if tid == currentApp.ID {
				isTargeted = true
				break
			}
		}
		if !isTargeted {
			httpx.Error(w, http.StatusForbidden, "you are not assigned to this assignment")
			return
		}
	}

	var req SubmitAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.FileURL == "" && req.GithubURL == "" && req.Notes == "" {
		httpx.Error(w, http.StatusBadRequest, "submission must include an uploaded file, a GitHub link, or submission notes")
		return
	}

	status := model.AssignmentSubmissionSubmitted
	if assignment.DueDate != nil && time.Now().After(*assignment.DueDate) {
		status = model.AssignmentSubmissionLate
	}

	sub := &model.AssignmentSubmission{
		ID:           uuid.New(),
		AssignmentID: assignmentID,
		ApplicantID:  currentApp.ID,
		UserID:       &claims.UserID,
		FileURL:      req.FileURL,
		FileName:     req.FileName,
		FileSize:     req.FileSize,
		GithubURL:    req.GithubURL,
		Notes:        req.Notes,
		Status:       status,
	}

	submitted, err := h.assignmentRepo.SubmitAssignment(r.Context(), sub)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":    "Assignment submitted successfully!",
		"submission": submitted,
	})
}

type GradeSubmissionRequest struct {
	Score    float64 `json:"score"`
	Feedback string  `json:"feedback"`
}

// GradeSubmission handles POST /api/v1/programs/{programId}/assignments/{assignmentId}/submissions/{submissionId}/grade
func (h *AssignmentHandler) GradeSubmission(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	submissionIDStr := chi.URLParam(r, "submissionId")
	submissionID, err := uuid.Parse(submissionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid submission id")
		return
	}

	if !h.canManageAssignments(r, programID) {
		httpx.Error(w, http.StatusForbidden, "you do not have permission to grade submissions for this program")
		return
	}

	var req GradeSubmissionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Score < 0 {
		httpx.Error(w, http.StatusBadRequest, "score must be greater than or equal to 0")
		return
	}

	claims, _ := middleware.GetUser(r.Context())
	var graderID *uuid.UUID
	if claims != nil {
		graderID = &claims.UserID
	}

	graded, err := h.assignmentRepo.GradeSubmission(r.Context(), submissionID, req.Score, req.Feedback, graderID)
	if err != nil {
		if errors.Is(err, repository.ErrAssignmentSubmissionNotFound) {
			httpx.Error(w, http.StatusNotFound, "submission record not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":    "Submission graded successfully",
		"submission": graded,
	})
}
