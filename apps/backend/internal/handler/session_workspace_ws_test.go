package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestSessionWorkspace_WebSocketAndREST(t *testing.T) {
	sessionRepo := repository.NewSessionRepository(nil, nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	userRepo := repository.NewUserRepository(nil)
	authSvc := auth.NewService("test-secret-at-least-32-chars-long!", 24*time.Hour)

	h := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo, authSvc)

	// Seed a test session
	progID := uuid.New()
	sess, err := sessionRepo.CreateSession(t.Context(), &model.ProgramSession{
		ProgramID:   progID,
		Title:       "Distributed Systems & Architecture",
		Description: "Live coding and design workshop",
		SessionType: model.SessionTypeLiveLecture,
		StartTime:   time.Now().Add(1 * time.Hour),
		EndTime:     time.Now().Add(2 * time.Hour),
		MeetingURL:  "https://meet.google.com/abc-defg-hij",
	})
	if err != nil {
		t.Fatalf("failed to seed session: %v", err)
	}

	r := chi.NewRouter()
	r.Get("/api/v1/sessions/{sessionId}/ws", h.HandleWorkspaceWS)
	r.Get("/api/v1/sessions/{sessionId}/workspace", h.GetWorkspaceState)
	r.Put("/api/v1/sessions/{sessionId}/workspace", h.UpdateWorkspaceState)

	server := httptest.NewServer(r)
	defer server.Close()

	// 1. Test REST PUT workspace state
	initialState := `{"whiteboard":{"elements":[{"id":"node-1"}]},"code":{"language":"python","files":{"python":"print('hi')"}},"scratchpad":"notes"}`
	req, _ := http.NewRequest(http.MethodPut, server.URL+"/api/v1/sessions/"+sess.ID.String()+"/workspace", bytes.NewBufferString(initialState))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("failed to PUT workspace state: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from PUT workspace, got %d", resp.StatusCode)
	}

	// 2. Test REST GET workspace state
	getResp, err := http.Get(server.URL + "/api/v1/sessions/" + sess.ID.String() + "/workspace")
	if err != nil {
		t.Fatalf("failed to GET workspace state: %v", err)
	}
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from GET workspace, got %d", getResp.StatusCode)
	}
	var fetchedState map[string]any
	_ = json.NewDecoder(getResp.Body).Decode(&fetchedState)
	if fetchedState["scratchpad"] != "notes" {
		t.Errorf("expected scratchpad to be 'notes', got %v", fetchedState["scratchpad"])
	}

	// 3. Test WebSocket connection
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/sessions/" + sess.ID.String() + "/ws?name=Alex&role=mentor"
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to connect to session workspace websocket: %v", err)
	}
	defer wsConn.Close()

	// Should receive init_state
	var initMsg struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	err = wsConn.ReadJSON(&initMsg)
	if err != nil {
		t.Fatalf("failed to read init message from websocket: %v", err)
	}
	if initMsg.Type != "init_state" {
		t.Errorf("expected init_state message, got %s", initMsg.Type)
	}
}
