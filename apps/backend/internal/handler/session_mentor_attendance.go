package handler

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
)

// canManageMentorAttendance allows platform superadmins, and admins/reviewers of the program's organization.
func (h *SessionHandler) canManageMentorAttendance(r *http.Request, programID uuid.UUID) bool {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		return false
	}
	if claims.Role == model.RoleSuperadmin {
		return true
	}
	if claims.Role != model.RoleOrgAdmin && claims.Role != model.RoleReviewer {
		return false
	}
	program, err := h.programRepo.GetByID(r.Context(), programID)
	if err != nil || program == nil || claims.OrganizationID == nil {
		return false
	}
	return program.OrganizationID == *claims.OrganizationID
}

type mentorRosterEntry struct {
	UserID    uuid.UUID
	Name      string
	Email     string
	RoleTitle string
}

// mentorRoster lists the program's assigned mentors plus any extra users who lead the given sessions.
func (h *SessionHandler) mentorRoster(ctx context.Context, programID uuid.UUID, sessions []model.ProgramSession) []mentorRosterEntry {
	var roster []mentorRosterEntry
	seen := map[uuid.UUID]bool{}

	add := func(userID uuid.UUID, name, email, roleTitle string) {
		if seen[userID] {
			return
		}
		seen[userID] = true
		if (name == "" || email == "") && h.userRepo != nil {
			if u, err := h.userRepo.GetByID(ctx, userID); err == nil && u != nil {
				if name == "" {
					name = u.Name
				}
				if email == "" {
					email = u.Email
				}
			}
		}
		if name == "" {
			name = email
		}
		roster = append(roster, mentorRosterEntry{UserID: userID, Name: name, Email: email, RoleTitle: roleTitle})
	}

	if h.mentorRepo != nil {
		if mentors, err := h.mentorRepo.ListMentorsByProgram(ctx, programID); err == nil {
			for _, m := range mentors {
				add(m.UserID, m.UserName, m.UserEmail, m.RoleTitle)
			}
		}
	}
	for _, s := range sessions {
		if s.MentorID != nil {
			add(*s.MentorID, s.MentorName, "", "Session Lead")
		}
	}

	sort.SliceStable(roster, func(i, j int) bool {
		return strings.ToLower(roster[i].Name) < strings.ToLower(roster[j].Name)
	})
	return roster
}

// GetMentorAttendance handles GET /api/v1/programs/{programId}/sessions/{sessionId}/mentor-attendance
func (h *SessionHandler) GetMentorAttendance(w http.ResponseWriter, r *http.Request) {
	programID, sessionID, sess, ok := h.loadSessionForMentorAttendance(w, r)
	if !ok {
		return
	}

	records, err := h.sessionRepo.ListMentorAttendance(r.Context(), programID, &sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to get mentor attendance")
		return
	}
	byUser := map[uuid.UUID]model.MentorAttendance{}
	for _, rec := range records {
		byUser[rec.UserID] = rec
	}

	list := []model.MentorAttendance{}
	for _, m := range h.mentorRoster(r.Context(), programID, []model.ProgramSession{*sess}) {
		entry := model.MentorAttendance{
			SessionID: sessionID,
			UserID:    m.UserID,
			Status:    model.AttendanceStatusAbsent,
		}
		if rec, found := byUser[m.UserID]; found {
			entry = rec
		}
		entry.MentorName = m.Name
		entry.MentorEmail = m.Email
		entry.RoleTitle = m.RoleTitle
		entry.IsLead = sess.MentorID != nil && *sess.MentorID == m.UserID
		list = append(list, entry)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"attendance": list})
}

// BatchUpdateMentorAttendanceRequest payload
type BatchUpdateMentorAttendanceRequest struct {
	Attendances []struct {
		UserID uuid.UUID              `json:"user_id"`
		Status model.AttendanceStatus `json:"status"`
		Notes  string                 `json:"notes,omitempty"`
	} `json:"attendances"`
}

// BatchUpdateMentorAttendance handles POST /api/v1/programs/{programId}/sessions/{sessionId}/mentor-attendance
func (h *SessionHandler) BatchUpdateMentorAttendance(w http.ResponseWriter, r *http.Request) {
	programID, sessionID, sess, ok := h.loadSessionForMentorAttendance(w, r)
	if !ok {
		return
	}

	var req BatchUpdateMentorAttendanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	onRoster := map[uuid.UUID]bool{}
	for _, m := range h.mentorRoster(r.Context(), programID, []model.ProgramSession{*sess}) {
		onRoster[m.UserID] = true
	}

	var toUpdate []model.MentorAttendance
	for _, a := range req.Attendances {
		switch a.Status {
		case model.AttendanceStatusPresent, model.AttendanceStatusLate, model.AttendanceStatusAbsent, model.AttendanceStatusExcused:
		default:
			httpx.Error(w, http.StatusBadRequest, "invalid attendance status: must be present, late, absent, or excused")
			return
		}
		if !onRoster[a.UserID] {
			httpx.Error(w, http.StatusBadRequest, "user is not a mentor of this program")
			return
		}
		toUpdate = append(toUpdate, model.MentorAttendance{
			UserID: a.UserID,
			Status: a.Status,
			Notes:  strings.TrimSpace(a.Notes),
		})
	}

	claims, _ := middleware.GetUser(r.Context())
	if err := h.sessionRepo.BatchUpdateMentorAttendance(r.Context(), sessionID, toUpdate, claims.UserID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update mentor attendance")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"message": "mentor attendance updated successfully"})
}

// GetMentorAttendanceSummary handles GET /api/v1/programs/{programId}/sessions/mentor-attendance-summary
func (h *SessionHandler) GetMentorAttendanceSummary(w http.ResponseWriter, r *http.Request) {
	programID, err := uuid.Parse(chi.URLParam(r, "programId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}
	if !h.canManageMentorAttendance(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to view mentor attendance")
		return
	}

	sessions, err := h.sessionRepo.ListSessionsByProgram(r.Context(), programID, nil, nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	records, err := h.sessionRepo.ListMentorAttendance(r.Context(), programID, nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to get mentor attendance")
		return
	}

	now := time.Now()
	held := 0
	ledBy := map[uuid.UUID]int{}
	for _, s := range sessions {
		if s.StartTime.After(now) {
			continue
		}
		held++
		if s.MentorID != nil {
			ledBy[*s.MentorID]++
		}
	}

	summaries := []model.MentorAttendanceSummary{}
	for _, m := range h.mentorRoster(r.Context(), programID, sessions) {
		s := model.MentorAttendanceSummary{
			UserID:        m.UserID,
			FullName:      m.Name,
			Email:         m.Email,
			RoleTitle:     m.RoleTitle,
			TotalSessions: held,
			LedCount:      ledBy[m.UserID],
		}
		for _, rec := range records {
			if rec.UserID != m.UserID {
				continue
			}
			switch rec.Status {
			case model.AttendanceStatusPresent:
				s.PresentCount++
			case model.AttendanceStatusLate:
				s.LateCount++
			case model.AttendanceStatusAbsent:
				s.AbsentCount++
			case model.AttendanceStatusExcused:
				s.ExcusedCount++
			}
		}
		if held > 0 {
			s.AttendanceRate = int(math.Round(float64(s.PresentCount+s.LateCount) / float64(held) * 100))
		}
		switch {
		case s.AttendanceRate >= 80:
			s.Status = "Good"
		case s.AttendanceRate >= 65:
			s.Status = "Warning"
		default:
			s.Status = "At Risk"
		}
		summaries = append(summaries, s)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"summaries": summaries})
}

// loadSessionForMentorAttendance parses the route, checks permission, and loads the session.
func (h *SessionHandler) loadSessionForMentorAttendance(w http.ResponseWriter, r *http.Request) (uuid.UUID, uuid.UUID, *model.ProgramSession, bool) {
	programID, err := uuid.Parse(chi.URLParam(r, "programId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return uuid.Nil, uuid.Nil, nil, false
	}
	sessionID, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid session id")
		return uuid.Nil, uuid.Nil, nil, false
	}
	if !h.canManageMentorAttendance(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to manage mentor attendance")
		return uuid.Nil, uuid.Nil, nil, false
	}
	sess, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil || sess == nil || sess.ProgramID != programID {
		httpx.Error(w, http.StatusNotFound, "session not found for this program")
		return uuid.Nil, uuid.Nil, nil, false
	}
	return programID, sessionID, sess, true
}
