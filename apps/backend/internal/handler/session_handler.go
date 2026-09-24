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

type SessionHandler struct {
	sessionRepo   *repository.SessionRepository
	programRepo   *repository.ProgramRepository
	applicantRepo *repository.ApplicantRepository
	mentorRepo    *repository.MentorRepository
	userRepo      *repository.UserRepository
}

func NewSessionHandler(
	sessionRepo *repository.SessionRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	mentorRepo *repository.MentorRepository,
	userRepo *repository.UserRepository,
) *SessionHandler {
	return &SessionHandler{
		sessionRepo:   sessionRepo,
		programRepo:   programRepo,
		applicantRepo: applicantRepo,
		mentorRepo:    mentorRepo,
		userRepo:      userRepo,
	}
}

// canManageSessions checks whether the user is an admin or an assigned mentor
func (h *SessionHandler) canManageSessions(r *http.Request, programID uuid.UUID) bool {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		return false
	}
	if claims.Role == model.RoleSuperadmin || claims.Role == model.RoleOrgAdmin || claims.Role == model.RoleReviewer {
		return true
	}
	if claims.Role == model.RoleMentor {
		// Verify mentor assignment to program
		if h.mentorRepo != nil {
			isAssigned, err := h.mentorRepo.IsMentorOfProgram(r.Context(), claims.UserID, programID)
			if err == nil && isAssigned {
				return true
			}
		}
	}
	return false
}

// ListSessions handles GET /api/v1/programs/{programId}/sessions
func (h *SessionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
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

	// If candidate/fellow is logged in, find their accepted application
	if claims != nil && (claims.Role == model.RoleCandidate || claims.Role == "") {
		apps, err := h.applicantRepo.ListByEmail(r.Context(), claims.Email)
		if err == nil {
			for _, app := range apps {
				if app.ProgramID == programID && app.CurrentStage == model.StageApprovedForLive {
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

	sessions, err := h.sessionRepo.ListSessionsByProgram(r.Context(), programID, trackID, fellowApplicantID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list sessions: "+err.Error())
		return
	}
	if sessions == nil {
		sessions = []model.ProgramSession{}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"sessions": sessions,
	})
}

// CreateSessionRequest payload
type CreateSessionRequest struct {
	TrackID      *uuid.UUID        `json:"track_id,omitempty"`
	Title        string            `json:"title"`
	Description  string            `json:"description"`
	SessionType  model.SessionType `json:"session_type"`
	StartTime    string            `json:"start_time"`
	EndTime      string            `json:"end_time"`
	MeetingURL   string            `json:"meeting_url"`
	RecordingURL string            `json:"recording_url,omitempty"`
	MentorID     *uuid.UUID        `json:"mentor_id,omitempty"`
}

// CreateSession handles POST /api/v1/programs/{programId}/sessions
func (h *SessionHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to create sessions for this program")
		return
	}

	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "session title is required")
		return
	}

	startTime, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid start_time format, expected RFC3339: "+err.Error())
		return
	}

	endTime, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid end_time format, expected RFC3339: "+err.Error())
		return
	}

	if endTime.Before(startTime) {
		httpx.Error(w, http.StatusBadRequest, "end_time must be after start_time")
		return
	}

	sessionType := req.SessionType
	if sessionType == "" {
		sessionType = model.SessionTypeLiveLecture
	}

	sess := &model.ProgramSession{
		ID:           uuid.New(),
		ProgramID:    programID,
		TrackID:      req.TrackID,
		Title:        req.Title,
		Description:  req.Description,
		SessionType:  sessionType,
		StartTime:    startTime,
		EndTime:      endTime,
		MeetingURL:   req.MeetingURL,
		RecordingURL: req.RecordingURL,
		MentorID:     req.MentorID,
	}

	created, err := h.sessionRepo.CreateSession(r.Context(), sess)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create session: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

// GetSession handles GET /api/v1/programs/{programId}/sessions/{sessionId}
func (h *SessionHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	sess, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, repository.ErrSessionNotFound) {
			httpx.Error(w, http.StatusNotFound, "session not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to get session: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, sess)
}

// UpdateSession handles PUT /api/v1/programs/{programId}/sessions/{sessionId}
func (h *SessionHandler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to update sessions for this program")
		return
	}

	existing, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, repository.ErrSessionNotFound) {
			httpx.Error(w, http.StatusNotFound, "session not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to get session: "+err.Error())
		return
	}

	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.Title != "" {
		existing.Title = req.Title
	}
	existing.Description = req.Description
	if req.SessionType != "" {
		existing.SessionType = req.SessionType
	}
	if req.StartTime != "" {
		if st, err := time.Parse(time.RFC3339, req.StartTime); err == nil {
			existing.StartTime = st
		}
	}
	if req.EndTime != "" {
		if et, err := time.Parse(time.RFC3339, req.EndTime); err == nil {
			existing.EndTime = et
		}
	}
	existing.MeetingURL = req.MeetingURL
	existing.RecordingURL = req.RecordingURL
	existing.MentorID = req.MentorID
	existing.TrackID = req.TrackID

	updated, err := h.sessionRepo.UpdateSession(r.Context(), existing)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update session: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

// DeleteSession handles DELETE /api/v1/programs/{programId}/sessions/{sessionId}
func (h *SessionHandler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to delete sessions for this program")
		return
	}

	if err := h.sessionRepo.DeleteSession(r.Context(), sessionID); err != nil {
		if errors.Is(err, repository.ErrSessionNotFound) {
			httpx.Error(w, http.StatusNotFound, "session not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to delete session: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"message": "session deleted successfully"})
}

// GetSessionAttendance handles GET /api/v1/programs/{programId}/sessions/{sessionId}/attendance
func (h *SessionHandler) GetSessionAttendance(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to view session attendance")
		return
	}

	list, err := h.sessionRepo.GetSessionAttendanceList(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to get attendance list: "+err.Error())
		return
	}
	if list == nil {
		list = []model.SessionAttendance{}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"attendance": list,
	})
}

// BatchUpdateAttendanceRequest payload
type BatchUpdateAttendanceRequest struct {
	Attendances []struct {
		ApplicantID uuid.UUID              `json:"applicant_id"`
		Status      model.AttendanceStatus `json:"status"`
		Notes       string                 `json:"notes,omitempty"`
	} `json:"attendances"`
}

// BatchUpdateAttendance handles POST /api/v1/programs/{programId}/sessions/{sessionId}/attendance
func (h *SessionHandler) BatchUpdateAttendance(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to update session attendance")
		return
	}

	claims, _ := middleware.GetUser(r.Context())
	markedBy := claims.UserID

	var req BatchUpdateAttendanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	var toUpdate []model.SessionAttendance
	for _, a := range req.Attendances {
		toUpdate = append(toUpdate, model.SessionAttendance{
			SessionID:   sessionID,
			ApplicantID: a.ApplicantID,
			Status:      a.Status,
			Notes:       a.Notes,
		})
	}

	if err := h.sessionRepo.BatchUpdateAttendance(r.Context(), sessionID, toUpdate, markedBy); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update attendance: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"message": "attendance updated successfully"})
}

// FellowCheckIn handles POST /api/v1/programs/{programId}/sessions/{sessionId}/check-in
func (h *SessionHandler) FellowCheckIn(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "must be logged in to check into a session")
		return
	}

	// Verify fellow is accepted into this program
	apps, err := h.applicantRepo.ListByEmail(r.Context(), claims.Email)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to verify applicant record: "+err.Error())
		return
	}

	var acceptedApp *model.Applicant
	for _, app := range apps {
		if app.ProgramID == programID && app.CurrentStage == model.StageApprovedForLive {
			cp := app
			acceptedApp = &cp
			break
		}
	}

	if acceptedApp == nil {
		httpx.Error(w, http.StatusForbidden, "only accepted fellows in this cohort may check in")
		return
	}

	att, err := h.sessionRepo.FellowCheckIn(r.Context(), sessionID, acceptedApp.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to check in: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":    "check-in recorded successfully",
		"attendance": att,
	})
}

// GetAttendanceSummary handles GET /api/v1/programs/{programId}/attendance-summary
func (h *SessionHandler) GetAttendanceSummary(w http.ResponseWriter, r *http.Request) {
	programIDStr := chi.URLParam(r, "programId")
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}

	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to view program attendance summary")
		return
	}

	summaries, err := h.sessionRepo.GetFellowAttendanceSummary(r.Context(), programID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to get attendance summary: "+err.Error())
		return
	}
	if summaries == nil {
		summaries = []model.FellowAttendanceSummary{}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"summaries": summaries,
	})
}
