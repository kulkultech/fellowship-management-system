package middleware

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestLoggerSupportsWebSocketUpgrade(t *testing.T) {
	upgrader := websocket.Upgrader{}
	handler := Logger(slog.New(slog.NewTextHandler(io.Discard, nil)))(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.WriteMessage(websocket.TextMessage, []byte("hello"))
	}))
	srv := httptest.NewServer(handler)
	defer srv.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatalf("expected WebSocket upgrade through the logger, got: %v", err)
	}
	defer conn.Close()
	_, msg, err := conn.ReadMessage()
	if err != nil || string(msg) != "hello" {
		t.Fatalf("expected hello, got %q (%v)", msg, err)
	}
}
