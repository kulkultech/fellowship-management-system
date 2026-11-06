package handler

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/url"
	"strings"
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

	staff := h.canManageAssignments(r, programID)
	if !staff && fellowApplicantID == nil {
		// Neither staff nor a fellow of this program: nothing to see.
		httpx.JSON(w, http.StatusOK, map[string]any{"assignments": []*model.ProgramAssignment{}, "count": 0})
		return
	}

	assignments, err := h.assignmentRepo.ListAssignmentsByProgram(r.Context(), programID, trackID, fellowApplicantID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !staff {
		assignments = withoutDrafts(assignments)
	}
	if assignments == nil {
		assignments = []*model.ProgramAssignment{}
	}

	page, paged := httpx.ParsePage(r)
	if !paged {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"assignments": assignments,
			"count":       len(assignments),
		})
		return
	}

	// A fellow's progress counts every assignment, not just the page on screen.
	resp := map[string]any{}
	if fellowApplicantID != nil {
		resp["fellow_stats"] = assignmentFellowStats(assignments)
	}
	q := httpx.SearchQuery(r)
	status := r.URL.Query().Get("status") // published, draft or closed
	due := r.URL.Query().Get("due")       // upcoming, past or none
	now := time.Now()
	matched := make([]*model.ProgramAssignment, 0, len(assignments))
	for _, a := range assignments {
		if status != "" && string(a.Status) != status {
			continue
		}
		switch due {
		case "upcoming":
			if a.DueDate == nil || a.DueDate.Before(now) {
				continue
			}
		case "past":
			if a.DueDate == nil || !a.DueDate.Before(now) {
				continue
			}
		case "none":
			if a.DueDate != nil {
				continue
			}
		}
		if httpx.Matches(q, a.Title, a.Description, a.TrackName, a.CreatorName) {
			matched = append(matched, a)
		}
	}
	assignments = matched
	// A shared link to one assignment opens the page that holds it.
	if focus := r.URL.Query().Get("focus"); focus != "" {
		for i, a := range assignments {
			if a.ID.String() == focus {
				page.Number = i/page.Size + 1
				break
			}
		}
	}
	resp["assignments"] = httpx.Slice(assignments, page)
	resp["count"] = len(assignments)
	httpx.AddPageMeta(resp, page, len(assignments))
	httpx.JSON(w, http.StatusOK, resp)
}

// isLinkOrUpload accepts "", a path on this site (an uploaded file) or an http(s) link, so a
// stored link can never run script when clicked (javascript:, data:, ...).
func isLinkOrUpload(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return true
	}
	if strings.HasPrefix(raw, "/") {
		return !strings.HasPrefix(raw, "//") && !strings.HasPrefix(raw, "/\\")
	}
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// withoutDrafts drops assignments that are not published yet.
func withoutDrafts(assignments []*model.ProgramAssignment) []*model.ProgramAssignment {
	out := make([]*model.ProgramAssignment, 0, len(assignments))
	for _, a := range assignments {
		if a.Status != model.AssignmentStatusDraft {
			out = append(out, a)
		}
	}
	return out
}

// assignmentFellowStats sums a fellow's submissions and grades across all their assignments.
func assignmentFellowStats(assignments []*model.ProgramAssignment) map[string]any {
	submitted, graded := 0, 0
	var score, maxPossible float64
	for _, a := range assignments {
		sub := a.MySubmission
		if sub == nil {
			continue
		}
		submitted++
		if sub.Score != nil {
			graded++
			score += *sub.Score
			if a.MaxScore > 0 {
				maxPossible += float64(a.MaxScore)
			} else {
				maxPossible += 100
			}
		}
	}
	stats := map[string]any{
		"total":           len(assignments),
		"submitted":       submitted,
		"graded":          graded,
		"completion_rate": 0,
		"avg_score":       nil,
	}
	if len(assignments) > 0 {
		stats["completion_rate"] = int(math.Round(float64(submitted) / float64(len(assignments)) * 100))
	}
	if graded > 0 && maxPossible > 0 {
		stats["avg_score"] = int(math.Round(score / maxPossible * 100))
	}
	return stats
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

	// Drafts are hidden from everyone who can't edit them
	if assignment.Status == model.AssignmentStatusDraft && !h.canManageAssignments(r, assignment.ProgramID) {
		httpx.Error(w, http.StatusNotFound, "assignment not found")
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

	if !isLinkOrUpload(req.AttachmentURL) {
		httpx.Error(w, http.StatusBadRequest, "starter material must be an uploaded file or an http(s) link")
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
	// The form always sends the whole assignment, so an empty value removes the starter material.
	if !isLinkOrUpload(req.AttachmentURL) {
		httpx.Error(w, http.StatusBadRequest, "starter material must be an uploaded file or an http(s) link")
		return
	}
	existing.AttachmentURL = strings.TrimSpace(req.AttachmentURL)
	existing.AttachmentName = req.AttachmentName
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

	page, paged := httpx.ParsePage(r)
	if !paged {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"submissions": subs,
			"count":       len(subs),
		})
		return
	}

	// Counts cover every submission, so the tabs read the same on every page.
	graded := 0
	for _, s := range subs {
		if s.Status == model.AssignmentSubmissionGraded {
			graded++
		}
	}
	counts := map[string]int{"all": len(subs), "graded": graded, "pending": len(subs) - graded}

	q := httpx.SearchQuery(r)
	status := r.URL.Query().Get("status") // "graded" or "pending"
	matched := make([]*model.AssignmentSubmission, 0, len(subs))
	for _, s := range subs {
		isGraded := s.Status == model.AssignmentSubmissionGraded
		if (status == "graded" && !isGraded) || (status == "pending" && isGraded) {
			continue
		}
		if httpx.Matches(q, s.FellowName, s.FellowEmail, s.TrackName, s.University) {
			matched = append(matched, s)
		}
	}
	resp := map[string]any{
		"submissions":   httpx.Slice(matched, page),
		"count":         len(matched),
		"status_counts": counts,
	}
	httpx.AddPageMeta(resp, page, len(matched))
	httpx.JSON(w, http.StatusOK, resp)
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

	// Verify assignment belongs to program (and is published: drafts can't be submitted)
	assignment, err := h.assignmentRepo.GetAssignmentByID(r.Context(), assignmentID)
	if err != nil || assignment.ProgramID != programID || assignment.Status == model.AssignmentStatusDraft {
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
