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

	// Seed a program, an admitted fellow, an assigned mentor, and a session
	orgID := uuid.New()
	progID := uuid.New()
	if _, err := programRepo.Create(t.Context(), &model.Program{ID: progID, OrganizationID: orgID, Slug: "ws-2026", Name: "WS Fellowship"}); err != nil {
		t.Fatalf("failed to seed program: %v", err)
	}
	if _, _, err := applicantRepo.CreateOrGet(t.Context(), &model.Applicant{
		ID: uuid.New(), OrganizationID: orgID, ProgramID: progID,
		Email: "fellow@example.com", FullName: "Fellow One", CurrentStage: model.StageApprovedForLive,
	}); err != nil {
		t.Fatalf("failed to seed fellow: %v", err)
	}
	mentorID := uuid.New()
	if _, err := mentorRepo.AssignMentor(t.Context(), progID, mentorID, "Mentor", ""); err != nil {
		t.Fatalf("failed to assign mentor: %v", err)
	}
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

	token := func(userID uuid.UUID, org *uuid.UUID, email, role string) string {
		tok, err := authSvc.GenerateToken(userID, org, email, role)
		if err != nil {
			t.Fatalf("failed to generate token: %v", err)
		}
		return tok
	}
	mentorToken := token(mentorID, nil, "mentor@example.com", model.RoleMentor)
	fellowToken := token(uuid.New(), nil, "fellow@example.com", model.RoleCandidate)
	outsiderToken := token(uuid.New(), nil, "outsider@example.com", model.RoleCandidate)
	otherOrg := uuid.New()
	otherAdminToken := token(uuid.New(), &otherOrg, "admin@other.org", model.RoleOrgAdmin)

	r := chi.NewRouter()
	r.Get("/api/v1/sessions/{sessionId}/ws", h.HandleWorkspaceWS)
	r.Get("/api/v1/sessions/{sessionId}/workspace", h.GetWorkspaceState)
	r.Put("/api/v1/sessions/{sessionId}/workspace", h.UpdateWorkspaceState)
	server := httptest.NewServer(r)
	defer server.Close()

	workspaceURL := server.URL + "/api/v1/sessions/" + sess.ID.String() + "/workspace"
	do := func(method, tok string, body string) int {
		req, _ := http.NewRequest(method, workspaceURL, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		if tok != "" {
			req.AddCookie(&http.Cookie{Name: auth.AuthCookieName, Value: tok})
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s workspace: %v", method, err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}

	// 1. REST: only signed-in program staff can overwrite the workspace
	initialState := `{"whiteboard":{"elements":[{"id":"node-1"}]},"code":{"language":"python","files":{"python":"print('hi')"}},"scratchpad":"notes"}`
	if code := do(http.MethodPut, "", initialState); code != http.StatusUnauthorized {
		t.Errorf("expected 401 for anonymous PUT, got %d", code)
	}
	if code := do(http.MethodPut, fellowToken, initialState); code != http.StatusForbidden {
		t.Errorf("expected 403 for a fellow PUT, got %d", code)
	}
	if code := do(http.MethodPut, mentorToken, initialState); code != http.StatusOK {
		t.Fatalf("expected 200 for the assigned mentor's PUT, got %d", code)
	}

	// 2. REST: members can read it, others cannot
	if code := do(http.MethodGet, "", ""); code != http.StatusUnauthorized {
		t.Errorf("expected 401 for anonymous GET, got %d", code)
	}
	if code := do(http.MethodGet, outsiderToken, ""); code != http.StatusForbidden {
		t.Errorf("expected 403 for a non-member GET, got %d", code)
	}
	req, _ := http.NewRequest(http.MethodGet, workspaceURL, nil)
	req.AddCookie(&http.Cookie{Name: auth.AuthCookieName, Value: fellowToken})
	getResp, err := http.DefaultClient.Do(req)
	if err != nil || getResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for the fellow's GET, got %v / %v", getResp, err)
	}
	var fetchedState map[string]any
	_ = json.NewDecoder(getResp.Body).Decode(&fetchedState)
	getResp.Body.Close()
	if fetchedState["scratchpad"] != "notes" {
		t.Errorf("expected scratchpad to be 'notes', got %v", fetchedState["scratchpad"])
	}

	// 3. WebSocket: anonymous connections are rejected even when they claim a role in the URL
	wsBase := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/sessions/" + sess.ID.String() + "/ws"
	dial := func(query string, header http.Header) (*websocket.Conn, int) {
		conn, resp, err := websocket.DefaultDialer.Dial(wsBase+query, header)
		if err != nil {
			if resp == nil {
				t.Fatalf("dial failed without response: %v", err)
			}
			return nil, resp.StatusCode
		}
		return conn, http.StatusSwitchingProtocols
	}
	if _, code := dial("?name=Alex&role=mentor", nil); code != http.StatusUnauthorized {
		t.Errorf("expected 401 for anonymous socket, got %d", code)
	}
	if _, code := dial("?token="+outsiderToken, nil); code != http.StatusForbidden {
		t.Errorf("expected 403 for a non-member socket, got %d", code)
	}
	if _, code := dial("?token="+otherAdminToken, nil); code != http.StatusForbidden {
		t.Errorf("expected 403 for another organization's admin, got %d", code)
	}
	if _, code := dial("?token="+fellowToken, http.Header{"Origin": {"https://evil.example"}}); code != http.StatusForbidden {
		t.Errorf("expected 403 for a foreign origin, got %d", code)
	}

	// 4. WebSocket: a fellow joins with the identity from their token, not the URL
	wsConn, code := dial("?token="+fellowToken+"&role=mentor&name=Imposter", nil)
	if code != http.StatusSwitchingProtocols {
		t.Fatalf("expected the fellow to connect, got %d", code)
	}
	defer wsConn.Close()
	var initMsg struct {
		Type    string `json:"type"`
		Payload struct {
			Participants []struct {
				Name string `json:"name"`
				Role string `json:"role"`
			} `json:"participants"`
		} `json:"payload"`
	}
	if err := wsConn.ReadJSON(&initMsg); err != nil {
		t.Fatalf("failed to read init message from websocket: %v", err)
	}
	if initMsg.Type != "init_state" {
		t.Errorf("expected init_state message, got %s", initMsg.Type)
	}
	if len(initMsg.Payload.Participants) != 1 || initMsg.Payload.Participants[0].Role != model.RoleCandidate ||
		initMsg.Payload.Participants[0].Name == "Imposter" {
		t.Errorf("expected the fellow's real identity, got %+v", initMsg.Payload.Participants)
	}
}
