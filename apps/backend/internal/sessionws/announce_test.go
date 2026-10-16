package sessionws

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// A server event announced for a session reaches everyone connected to its workspace.
func TestHubAnnounce(t *testing.T) {
	hub := NewHub(&mockStateRepo{states: map[uuid.UUID]json.RawMessage{}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer hub.Close()
	sessionID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWebSocket(w, r, sessionID, uuid.New().String(), "Fiona", "candidate")
	}))
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	payload, _ := json.Marshal(map[string]any{"ended_at": time.Now()})
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	announced := false
	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			t.Fatalf("expected a session_status message, got error %v", err)
		}
		if msg.Type == "init_state" && !announced {
			hub.Announce(sessionID, Message{Type: "session_status", Payload: payload})
			announced = true
			continue
		}
		if msg.Type == "session_status" {
			return
		}
	}
}
