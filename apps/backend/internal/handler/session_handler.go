package handler

import (
	"context"
	"encoding/json"
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
	"github.com/kulkul/backend/internal/calendar"
	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/holiday"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/internal/sessionws"
)

type SessionHandler struct {
	sessionRepo     *repository.SessionRepository
	programRepo     *repository.ProgramRepository
	applicantRepo   *repository.ApplicantRepository
	mentorRepo      *repository.MentorRepository
	userRepo        *repository.UserRepository
	calendarService calendar.Service
	emailService    email.Service
	authService     *auth.Service
	frontendURL     string
	wsHub           *sessionws.Hub
}

func NewSessionHandler(
	sessionRepo *repository.SessionRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	mentorRepo *repository.MentorRepository,
	userRepo *repository.UserRepository,
	services ...any,
) *SessionHandler {
	h := &SessionHandler{
		sessionRepo:   sessionRepo,
		programRepo:   programRepo,
		applicantRepo: applicantRepo,
		mentorRepo:    mentorRepo,
		userRepo:      userRepo,
		frontendURL:   "http://localhost:5173",
	}

	for _, s := range services {
		switch v := s.(type) {
		case calendar.Service:
			h.calendarService = v
		case email.Service:
			h.emailService = v
		case *auth.Service:
			h.authService = v
		case *sessionws.Hub:
			h.wsHub = v
		case string:
			if strings.HasPrefix(v, "http") {
				h.frontendURL = strings.TrimRight(v, "/")
			}
		}
	}

	if h.wsHub == nil {
		h.wsHub = sessionws.NewHub(sessionRepo, slog.Default())
	}

	return h
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
	TrackID                *uuid.UUID        `json:"track_id,omitempty"`
	Title                  string            `json:"title"`
	Description            string            `json:"description"`
	SessionType            model.SessionType `json:"session_type"`
	StartTime              string            `json:"start_time"`
	EndTime                string            `json:"end_time"`
	MeetingURL             string            `json:"meeting_url"`
	RecordingURL           string            `json:"recording_url,omitempty"`
	MentorID               *uuid.UUID        `json:"mentor_id,omitempty"`
	TargetApplicantIDs     []uuid.UUID       `json:"target_applicant_ids,omitempty"`
	SyncIndonesianCalendar *bool             `json:"sync_indonesian_calendar,omitempty"`
	AutoGenerateMeeting    *bool             `json:"auto_generate_meeting,omitempty"`
	SendCalendarInvites    *bool             `json:"send_calendar_invites,omitempty"`
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

	syncIndonesian := true
	if req.SyncIndonesianCalendar != nil {
		syncIndonesian = *req.SyncIndonesianCalendar
	}

	if syncIndonesian {
		if isHoliday, holidayName := holiday.IsIndonesianHoliday(startTime); isHoliday {
			httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("cannot schedule session on Indonesian national holiday: %s", holidayName))
			return
		}
	}

	sessionType := req.SessionType
	if sessionType == "" {
		sessionType = model.SessionTypeLiveLecture
	}

	targetIDs := req.TargetApplicantIDs
	if targetIDs == nil {
		targetIDs = []uuid.UUID{}
	}

	autoGenMeeting := true
	if req.AutoGenerateMeeting != nil {
		autoGenMeeting = *req.AutoGenerateMeeting
	}
	meetingURL := strings.TrimSpace(req.MeetingURL)
	if meetingURL == "" || meetingURL == "https://meet.google.com/" || meetingURL == "https://meet.google.com" || autoGenMeeting {
		if h.calendarService != nil {
			meetingURL = h.calendarService.GenerateMeetLink()
		} else {
			meetingURL = "https://meet.google.com/" + uuid.NewString()[:12]
		}
	}

	sess := &model.ProgramSession{
		ID:                 uuid.New(),
		ProgramID:          programID,
		TrackID:            req.TrackID,
		Title:              req.Title,
		Description:        req.Description,
		SessionType:        sessionType,
		StartTime:          startTime,
		EndTime:            endTime,
		MeetingURL:         meetingURL,
		RecordingURL:       req.RecordingURL,
		MentorID:           req.MentorID,
		TargetApplicantIDs: targetIDs,
	}

	sendInvites := true
	if req.SendCalendarInvites != nil {
		sendInvites = *req.SendCalendarInvites
	}

	var invitedAttendees []calendar.Attendee
	if h.sessionRepo != nil {
		attendees, _ := h.sessionRepo.GetSessionInvitedAttendees(r.Context(), programID, req.TrackID, targetIDs, req.MentorID)
		invitedAttendees = attendees
	}

	programName := "Fellowship Cohort"
	if h.programRepo != nil {
		if prog, pErr := h.programRepo.GetByID(r.Context(), programID); pErr == nil && prog != nil && prog.Name != "" {
			programName = prog.Name
		}
	}

	trackName := ""
	if len(invitedAttendees) > 0 && invitedAttendees[0].TrackName != "" {
		trackName = invitedAttendees[0].TrackName
	}

	claims, _ := middleware.GetUser(r.Context())
	organizerEmail := ""
	organizerName := ""
	if claims != nil {
		organizerEmail = claims.Email
	}

	var calWebURL string
	if h.calendarService != nil {
		workspaceURL := fmt.Sprintf("%s/sessions/%s/room", h.frontendURL, sess.ID)
		evRes, evErr := h.calendarService.CreateEvent(r.Context(), calendar.CreateEventRequest{
			SessionID:        sess.ID,
			ProgramID:        programID,
			ProgramName:      programName,
			TrackName:        trackName,
			Title:            req.Title,
			Description:      req.Description,
			SessionType:      string(sessionType),
			StartTime:        startTime,
			EndTime:          endTime,
			MeetingURL:       meetingURL,
			AutoGenerateMeet: autoGenMeeting,
			Attendees:        invitedAttendees,
			OrganizerEmail:   organizerEmail,
			OrganizerName:    organizerName,
			WorkspaceURL:     workspaceURL,
		})
		if evErr == nil && evRes != nil {
			sess.GoogleCalendarEventID = evRes.EventID
			sess.GoogleCalendarHTMLLink = evRes.HTMLLink
			calWebURL = evRes.GoogleCalendarWebURL
			if evRes.MeetingURL != "" {
				sess.MeetingURL = evRes.MeetingURL
			}
		}
	}

	created, err := h.sessionRepo.CreateSession(r.Context(), sess)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create session: "+err.Error())
		return
	}

	// Dispatch email invitations asynchronously with Google Meet and Google Calendar link
	if sendInvites && h.emailService != nil && len(invitedAttendees) > 0 {
		go func(attendees []calendar.Attendee, sessionCopy *model.ProgramSession, pName, tName, calURL string) {
			for _, att := range attendees {
				if att.Email != "" {
					_ = h.emailService.SendSessionInvitationEmail(att.Email, att.Name, pName, tName, sessionCopy, calURL)
				}
			}
		}(invitedAttendees, created, programName, trackName, calWebURL)
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
		st, err := time.Parse(time.RFC3339, req.StartTime)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid start_time format: "+err.Error())
			return
		}
		syncIndonesian := true
		if req.SyncIndonesianCalendar != nil {
			syncIndonesian = *req.SyncIndonesianCalendar
		}
		if syncIndonesian {
			if isHoliday, holidayName := holiday.IsIndonesianHoliday(st); isHoliday {
				httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("cannot schedule session on Indonesian national holiday: %s", holidayName))
				return
			}
		}
		existing.StartTime = st
	}
	if req.EndTime != "" {
		et, err := time.Parse(time.RFC3339, req.EndTime)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid end_time format: "+err.Error())
			return
		}
		existing.EndTime = et
	}
	if existing.EndTime.Before(existing.StartTime) {
		httpx.Error(w, http.StatusBadRequest, "end_time must be after start_time")
		return
	}
	if req.MeetingURL != "" {
		existing.MeetingURL = req.MeetingURL
	} else if req.AutoGenerateMeeting != nil && *req.AutoGenerateMeeting && existing.MeetingURL == "" {
		if h.calendarService != nil {
			existing.MeetingURL = h.calendarService.GenerateMeetLink()
		}
	}
	existing.RecordingURL = req.RecordingURL
	existing.MentorID = req.MentorID
	existing.TrackID = req.TrackID
	if req.TargetApplicantIDs != nil {
		existing.TargetApplicantIDs = req.TargetApplicantIDs
	}

	if h.calendarService != nil && existing.GoogleCalendarEventID != "" {
		attendees, _ := h.sessionRepo.GetSessionInvitedAttendees(r.Context(), programID, existing.TrackID, existing.TargetApplicantIDs, existing.MentorID)
		workspaceURL := fmt.Sprintf("%s/sessions/%s/room", h.frontendURL, existing.ID)
		_, _ = h.calendarService.UpdateEvent(r.Context(), existing.GoogleCalendarEventID, calendar.CreateEventRequest{
			SessionID:    existing.ID,
			ProgramID:    programID,
			Title:        existing.Title,
			Description:  existing.Description,
			SessionType:  string(existing.SessionType),
			StartTime:    existing.StartTime,
			EndTime:      existing.EndTime,
			MeetingURL:   existing.MeetingURL,
			Attendees:    attendees,
			WorkspaceURL: workspaceURL,
		})
	}

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

	if existing, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID); err == nil && existing != nil {
		if h.calendarService != nil && existing.GoogleCalendarEventID != "" {
			_ = h.calendarService.DeleteEvent(r.Context(), existing.GoogleCalendarEventID)
		}
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

// FellowCheckInRequest payload
type FellowCheckInRequest struct {
	ProofImageURL string `json:"proof_image_url"`
	Notes         string `json:"notes,omitempty"`
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

	// Verify session and student targeting
	sess, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil || sess.ProgramID != programID {
		httpx.Error(w, http.StatusNotFound, "session not found for this program")
		return
	}

	if len(sess.TargetApplicantIDs) > 0 {
		isTargeted := false
		for _, tid := range sess.TargetApplicantIDs {
			if tid == acceptedApp.ID {
				isTargeted = true
				break
			}
		}
		if !isTargeted {
			httpx.Error(w, http.StatusForbidden, "you are not invited to this session")
			return
		}
	}

	var req FellowCheckInRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	proofURL := strings.TrimSpace(req.ProofImageURL)
	if proofURL == "" {
		httpx.Error(w, http.StatusBadRequest, "screenshot proof is required to validate attendance")
		return
	}

	att, err := h.sessionRepo.FellowCheckIn(r.Context(), sessionID, acceptedApp.ID, proofURL, strings.TrimSpace(req.Notes))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to check in: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":    "attendance proof submitted successfully, awaiting mentor validation",
		"attendance": att,
	})
}

// ValidateAttendanceRequest payload
type ValidateAttendanceRequest struct {
	Status model.AttendanceStatus `json:"status"`
	Notes  string                 `json:"notes,omitempty"`
}

// ValidateAttendance handles POST /api/v1/programs/{programId}/sessions/{sessionId}/attendance/{applicantId}/validate
func (h *SessionHandler) ValidateAttendance(w http.ResponseWriter, r *http.Request) {
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

	applicantIDStr := chi.URLParam(r, "applicantId")
	applicantID, err := uuid.Parse(applicantIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}

	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to validate attendance for this program")
		return
	}

	claims, _ := middleware.GetUser(r.Context())
	markedBy := claims.UserID

	var req ValidateAttendanceRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Status == "" {
		req.Status = model.AttendanceStatusPresent
	}

	switch req.Status {
	case model.AttendanceStatusPresent, model.AttendanceStatusLate, model.AttendanceStatusAbsent, model.AttendanceStatusExcused:
		// valid
	default:
		httpx.Error(w, http.StatusBadRequest, "invalid attendance status: must be present, late, absent, or excused")
		return
	}

	att, err := h.sessionRepo.ValidateAttendance(r.Context(), sessionID, applicantID, req.Status, strings.TrimSpace(req.Notes), markedBy)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate attendance: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"message":    "attendance validated successfully",
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

// GetHolidays handles GET /api/v1/holidays?year=2026
func (h *SessionHandler) GetHolidays(w http.ResponseWriter, r *http.Request) {
	yearStr := r.URL.Query().Get("year")
	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}
	holidays := holiday.GetHolidays(year)
	httpx.JSON(w, http.StatusOK, holidays)
}

// HandleWorkspaceWS handles WebSocket connections for real-time Whiteboard & Code Studio collaboration
func (h *SessionHandler) HandleWorkspaceWS(w http.ResponseWriter, r *http.Request) {
	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	claims := h.resolveClaims(r)
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "sign in to join the session workspace")
		return
	}

	session, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return
	}
	if !h.canJoinWorkspace(r.Context(), claims, session.ProgramID) {
		httpx.Error(w, http.StatusForbidden, "you are not a member of this session's program")
		return
	}

	userName := claims.Email
	if u, err := h.userRepo.GetByID(r.Context(), claims.UserID); err == nil && u != nil && u.Name != "" {
		userName = u.Name
	}
	userRole := claims.Role
	if userRole == "" {
		userRole = model.RoleCandidate
	}

	h.wsHub.ServeWebSocket(w, r, sessionID, claims.UserID.String(), userName, userRole)
}

// resolveClaims returns the signed-in user from the auth middleware, the auth cookie, or a ?token=
// query parameter (browsers cannot set headers on WebSocket requests).
func (h *SessionHandler) resolveClaims(r *http.Request) *auth.Claims {
	if claims, ok := middleware.GetUser(r.Context()); ok && claims != nil {
		return claims
	}
	tokenStr := ""
	if cookie, err := r.Cookie(auth.AuthCookieName); err == nil && cookie.Value != "" {
		tokenStr = cookie.Value
	} else if qToken := r.URL.Query().Get("token"); qToken != "" {
		tokenStr = qToken
	}
	if tokenStr == "" || h.authService == nil {
		return nil
	}
	claims, err := h.authService.ValidateToken(tokenStr)
	if err != nil {
		return nil
	}
	return claims
}

// canJoinWorkspace allows superadmins, the program organization's admins and reviewers, mentors
// assigned to the program, and fellows admitted into the program.
func (h *SessionHandler) canJoinWorkspace(ctx context.Context, claims *auth.Claims, programID uuid.UUID) bool {
	switch claims.Role {
	case model.RoleSuperadmin:
		return true
	case model.RoleOrgAdmin, model.RoleReviewer:
		program, err := h.programRepo.GetByID(ctx, programID)
		return err == nil && program != nil && claims.OrganizationID != nil && *claims.OrganizationID == program.OrganizationID
	case model.RoleMentor:
		if h.mentorRepo == nil {
			return false
		}
		isMentor, err := h.mentorRepo.IsMentorOfProgram(ctx, claims.UserID, programID)
		return err == nil && isMentor
	default:
		if claims.Email == "" {
			return false
		}
		apps, err := h.applicantRepo.ListByEmail(ctx, claims.Email)
		if err != nil {
			return false
		}
		for _, app := range apps {
			if app.ProgramID != programID || app.DeletedAt != nil {
				continue
			}
			if app.CurrentStage == model.StageApprovedForLive || app.CurrentStage == model.StageCompleted || app.ProgramRoomInvitedAt != nil {
				return true
			}
		}
		return false
	}
}

// canEditWorkspaceDirectly allows only staff of the program to overwrite the stored workspace.
func (h *SessionHandler) canEditWorkspaceDirectly(ctx context.Context, claims *auth.Claims, programID uuid.UUID) bool {
	if claims.Role == model.RoleCandidate || claims.Role == "" {
		return false
	}
	return h.canJoinWorkspace(ctx, claims, programID)
}

// GetWorkspaceState handles GET /api/v1/sessions/{sessionId}/workspace
func (h *SessionHandler) GetWorkspaceState(w http.ResponseWriter, r *http.Request) {
	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	claims := h.resolveClaims(r)
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	session, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return
	}
	if !h.canJoinWorkspace(r.Context(), claims, session.ProgramID) {
		httpx.Error(w, http.StatusForbidden, "you are not a member of this session's program")
		return
	}

	state, err := h.sessionRepo.GetWorkspaceState(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "session workspace not found")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(state)
}

// UpdateWorkspaceState handles PUT /api/v1/sessions/{sessionId}/workspace
func (h *SessionHandler) UpdateWorkspaceState(w http.ResponseWriter, r *http.Request) {
	sessionIDStr := chi.URLParam(r, "sessionId")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return
	}

	claims := h.resolveClaims(r)
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	session, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return
	}
	if !h.canEditWorkspaceDirectly(r.Context(), claims, session.ProgramID) {
		httpx.Error(w, http.StatusForbidden, "only mentors and admins of this program can update the workspace")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8<<20))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	if err := h.sessionRepo.UpdateWorkspaceState(r.Context(), sessionID, json.RawMessage(body)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update workspace state")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}


