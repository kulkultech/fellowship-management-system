package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/model"
)

const (
	// Mentors can check in from 30 minutes before the start until the scheduled end
	mentorCheckInOpensBefore = 30 * time.Minute
	// Checking in more than 10 minutes after the start counts as late
	mentorLateAfter = 10 * time.Minute
)

type mentorCheckInResponse struct {
	Eligible   bool       `json:"eligible"` // the user is a mentor of this session
	Recorded   bool       `json:"recorded"` // attendance exists (self check-in or set by an admin)
	Status     string     `json:"status,omitempty"`
	RecordedAt *time.Time `json:"recorded_at,omitempty"`
	ByAdmin    bool       `json:"by_admin,omitempty"` // recorded by someone else
	OpensAt    time.Time  `json:"opens_at"`
	ClosesAt   time.Time  `json:"closes_at"`
	LateAfter  time.Time  `json:"late_after"`
	WindowOpen bool       `json:"window_open"`
	Message    string     `json:"message,omitempty"`
}

// mentorCheckInState works out whether the caller can check in to the session and what is recorded.
func (h *SessionHandler) mentorCheckInState(w http.ResponseWriter, r *http.Request) (*model.ProgramSession, *auth.Claims, *mentorCheckInResponse, bool) {
	sessionID, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return nil, nil, nil, false
	}
	claims := h.resolveClaims(r)
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return nil, nil, nil, false
	}
	session, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil || session == nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return nil, nil, nil, false
	}

	now := time.Now()
	state := &mentorCheckInResponse{
		OpensAt:   session.StartTime.Add(-mentorCheckInOpensBefore),
		ClosesAt:  session.EndTime,
		LateAfter: session.StartTime.Add(mentorLateAfter),
	}
	state.WindowOpen = !now.Before(state.OpensAt) && now.Before(state.ClosesAt)

	for _, m := range h.mentorRoster(r.Context(), session.ProgramID, []model.ProgramSession{*session}) {
		if m.UserID == claims.UserID {
			state.Eligible = true
			break
		}
	}
	if !state.Eligible {
		return session, claims, state, true
	}

	records, err := h.sessionRepo.ListMentorAttendance(r.Context(), session.ProgramID, &session.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load mentor attendance")
		return nil, nil, nil, false
	}
	for _, rec := range records {
		if rec.UserID == claims.UserID {
			state.Recorded = true
			state.Status = string(rec.Status)
			state.RecordedAt = rec.UpdatedAt
			state.ByAdmin = rec.MarkedBy != nil && *rec.MarkedBy != claims.UserID
			break
		}
	}
	return session, claims, state, true
}

// GetMentorCheckIn handles GET /api/v1/sessions/{sessionId}/mentor-check-in.
func (h *SessionHandler) GetMentorCheckIn(w http.ResponseWriter, r *http.Request) {
	if _, _, state, ok := h.mentorCheckInState(w, r); ok {
		httpx.JSON(w, http.StatusOK, state)
	}
}

// MentorCheckIn handles POST /api/v1/sessions/{sessionId}/mentor-check-in: a mentor marks their own
// attendance from the workspace. It never overwrites attendance that is already recorded.
func (h *SessionHandler) MentorCheckIn(w http.ResponseWriter, r *http.Request) {
	session, claims, state, ok := h.mentorCheckInState(w, r)
	if !ok {
		return
	}
	if !state.Eligible {
		httpx.Error(w, http.StatusForbidden, "only mentors of this session can check in")
		return
	}
	if state.Recorded {
		state.Message = "your attendance is already recorded"
		httpx.JSON(w, http.StatusOK, state)
		return
	}
	now := time.Now()
	if now.Before(state.OpensAt) {
		httpx.Error(w, http.StatusBadRequest, "check-in opens 30 minutes before the session starts")
		return
	}
	if !now.Before(state.ClosesAt) {
		httpx.Error(w, http.StatusBadRequest, "check-in closed when the session finished; ask an admin to record your attendance")
		return
	}

	status := model.AttendanceStatusPresent
	if now.After(state.LateAfter) {
		status = model.AttendanceStatusLate
	}
	if err := h.sessionRepo.BatchUpdateMentorAttendance(r.Context(), session.ID, []model.MentorAttendance{{
		UserID: claims.UserID,
		Status: status,
		Notes:  "Checked in from the workspace",
	}}, claims.UserID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to check in")
		return
	}
	state.Recorded = true
	state.Status = string(status)
	state.RecordedAt = &now
	state.Message = "checked in"
	httpx.JSON(w, http.StatusOK, state)
}
