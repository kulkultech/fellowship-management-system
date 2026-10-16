package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/internal/sessionws"
)

// EndSession handles POST /api/v1/sessions/{sessionId}/end: a mentor or admin marks the session
// as ended, which opens feedback for everyone in it.
func (h *SessionHandler) EndSession(w http.ResponseWriter, r *http.Request) {
	h.setSessionEnded(w, r, true)
}

// ReopenSession handles DELETE /api/v1/sessions/{sessionId}/end, undoing an accidental end.
func (h *SessionHandler) ReopenSession(w http.ResponseWriter, r *http.Request) {
	h.setSessionEnded(w, r, false)
}

func (h *SessionHandler) setSessionEnded(w http.ResponseWriter, r *http.Request, ended bool) {
	sessionID, err := uuid.Parse(chi.URLParam(r, "sessionId"))
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
		httpx.Error(w, http.StatusForbidden, "only mentors and admins of this program can end the session")
		return
	}

	var endedAt *time.Time
	name := claims.Email
	if ended {
		if session.EndedAt != nil {
			httpx.JSON(w, http.StatusOK, session) // already ended; keep the first end time
			return
		}
		now := time.Now()
		endedAt = &now
		if h.userRepo != nil {
			if u, err := h.userRepo.GetByID(r.Context(), claims.UserID); err == nil && u != nil && u.Name != "" {
				name = u.Name
			}
		}
	}
	userID := claims.UserID
	if err := h.sessionRepo.SetSessionEnded(r.Context(), sessionID, endedAt, &userID, name); err != nil {
		if errors.Is(err, repository.ErrSessionNotFound) {
			httpx.Error(w, http.StatusNotFound, "session not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update the session")
		return
	}
	updated, err := h.sessionRepo.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load the session")
		return
	}

	// Tell everyone in the workspace right away so feedback appears without a refresh
	if h.wsHub != nil {
		payload, _ := json.Marshal(map[string]any{"ended_at": updated.EndedAt, "ended_by_name": updated.EndedByName})
		h.wsHub.Announce(sessionID, sessionws.Message{Type: "session_status", SenderName: name, SenderRole: claims.Role, Payload: payload})
	}
	httpx.JSON(w, http.StatusOK, updated)
}
