package sessionws

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type mockStateRepo struct {
	mu     sync.Mutex
	states map[uuid.UUID]json.RawMessage
}

func (m *mockStateRepo) GetWorkspaceState(ctx context.Context, sessionID uuid.UUID) (json.RawMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.states[sessionID]; ok {
		return s, nil
	}
	return json.RawMessage("{}"), nil
}

func (m *mockStateRepo) UpdateWorkspaceState(ctx context.Context, sessionID uuid.UUID, state json.RawMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.states == nil {
		m.states = make(map[uuid.UUID]json.RawMessage)
	}
	m.states[sessionID] = state
	return nil
}

func TestSessionWSHub_Flow(t *testing.T) {
	repo := &mockStateRepo{states: make(map[uuid.UUID]json.RawMessage)}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	hub := NewHub(repo, logger)
	defer hub.Close()

	sessionID := uuid.New()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		role := r.URL.Query().Get("role")
		hub.ServeWebSocket(w, r, sessionID, uuid.New().String(), name, role)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// 1. Connect Mentor
	mentorConn, _, err := websocket.DefaultDialer.Dial(wsURL+"?name=MentorAlex&role=mentor", nil)
	if err != nil {
		t.Fatalf("failed to dial mentor ws: %v", err)
	}
	defer mentorConn.Close()

	// Mentor should receive init_state
	var initMsg Message
	err = mentorConn.ReadJSON(&initMsg)
	if err != nil {
		t.Fatalf("failed to read mentor init msg: %v", err)
	}
	if initMsg.Type != "init_state" {
		t.Errorf("expected init_state, got %s", initMsg.Type)
	}

	// 2. Connect Fellow
	fellowConn, _, err := websocket.DefaultDialer.Dial(wsURL+"?name=FellowSarah&role=candidate", nil)
	if err != nil {
		t.Fatalf("failed to dial fellow ws: %v", err)
	}
	defer fellowConn.Close()

	// Mentor should receive participant_joined
	var joinedMsg Message
	err = mentorConn.ReadJSON(&joinedMsg)
	if err != nil {
		t.Fatalf("mentor failed to receive participant_joined: %v", err)
	}
	if joinedMsg.Type != "participant_joined" {
		t.Errorf("expected participant_joined, got %s", joinedMsg.Type)
	}

	// Fellow should receive init_state
	var fellowInitMsg Message
	err = fellowConn.ReadJSON(&fellowInitMsg)
	if err != nil {
		t.Fatalf("fellow failed to read init: %v", err)
	}
	if fellowInitMsg.Type != "init_state" {
		t.Errorf("expected fellow init_state, got %s", fellowInitMsg.Type)
	}

	// 3. Mentor draws on Whiteboard -> Fellow receives update
	whiteboardPayload := []byte(`{"elements":[{"type":"rectangle","id":"rect-1"}],"appState":{"theme":"dark"}}`)
	err = mentorConn.WriteJSON(Message{
		Type:    "whiteboard_update",
		Payload: whiteboardPayload,
	})
	if err != nil {
		t.Fatalf("mentor failed to send whiteboard_update: %v", err)
	}

	var fellowReceivedWhiteboard Message
	err = fellowConn.ReadJSON(&fellowReceivedWhiteboard)
	if err != nil {
		t.Fatalf("fellow failed to receive whiteboard_update: %v", err)
	}
	if fellowReceivedWhiteboard.Type != "whiteboard_update" {
		t.Errorf("expected whiteboard_update on fellow, got %s", fellowReceivedWhiteboard.Type)
	}

	// 4. Mentor types code -> Fellow receives update
	codePayload := []byte(`{"language":"java","code":"System.out.println(\"Hello Fellowship!\");"}`)
	err = mentorConn.WriteJSON(Message{
		Type:    "code_update",
		Payload: codePayload,
	})
	if err != nil {
		t.Fatalf("mentor failed to send code_update: %v", err)
	}

	var fellowReceivedCode Message
	err = fellowConn.ReadJSON(&fellowReceivedCode)
	if err != nil {
		t.Fatalf("fellow failed to receive code_update: %v", err)
	}
	if fellowReceivedCode.Type != "code_update" {
		t.Errorf("expected code_update on fellow, got %s", fellowReceivedCode.Type)
	}

	// Allow persistence loop to flush
	time.Sleep(100 * time.Millisecond)
	hub.FlushAll()

	// Verify database persistence
	savedState, err := repo.GetWorkspaceState(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("failed to get saved workspace state: %v", err)
	}
	if !strings.Contains(string(savedState), "rect-1") {
		t.Errorf("expected saved state to contain whiteboard rect-1, got %s", string(savedState))
	}
	if !strings.Contains(string(savedState), "Hello Fellowship!") {
		t.Errorf("expected saved state to contain code snippet, got %s", string(savedState))
	}
}
