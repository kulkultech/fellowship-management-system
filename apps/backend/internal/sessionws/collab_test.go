package sessionws

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// wsReader reads messages from a socket, splitting frames that batch several newline-separated messages.
type wsReader struct {
	t       *testing.T
	conn    *websocket.Conn
	pending []Message
}

func dialHub(t *testing.T, hub *Hub, sessionID uuid.UUID, name, role string) *wsReader {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWebSocket(w, r, sessionID, uuid.New().String(), name, role)
	}))
	t.Cleanup(srv.Close)
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial %s: %v", name, err)
	}
	t.Cleanup(func() { conn.Close() })
	return &wsReader{t: t, conn: conn}
}

// next returns the next message of the given type, skipping others, or fails after a timeout.
func (r *wsReader) next(msgType string) Message {
	r.t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		for i, m := range r.pending {
			if m.Type == msgType {
				r.pending = append(r.pending[:i], r.pending[i+1:]...)
				return m
			}
		}
		_ = r.conn.SetReadDeadline(deadline)
		_, data, err := r.conn.ReadMessage()
		if err != nil {
			r.t.Fatalf("waiting for %s: %v", msgType, err)
		}
		for _, line := range strings.Split(string(data), "\n") {
			var m Message
			if json.Unmarshal([]byte(line), &m) == nil {
				r.pending = append(r.pending, m)
			}
		}
	}
}

func (r *wsReader) send(msgType string, payload any) {
	r.t.Helper()
	raw, _ := json.Marshal(payload)
	if err := r.conn.WriteJSON(Message{Type: msgType, Payload: raw}); err != nil {
		r.t.Fatalf("send %s: %v", msgType, err)
	}
}

func newTestLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func TestYjsUpdatesAreTaggedStoredAndCompacted(t *testing.T) {
	repo := &mockStateRepo{}
	hub := NewHub(repo, newTestLogger())
	defer hub.Close()
	sessionID := uuid.New()

	mentor := dialHub(t, hub, sessionID, "Mentor", "mentor")
	mentor.next("init_state")
	fellow := dialHub(t, hub, sessionID, "Fellow", "candidate")
	fellow.next("init_state")

	mentor.send("yjs_update", map[string]string{"update": b64("u1")})
	mentor.send("yjs_update", map[string]string{"update": b64("u2")})

	var got struct {
		Update string `json:"update"`
		Tag    YjsTag `json:"tag"`
	}
	_ = json.Unmarshal(fellow.next("yjs_update").Payload, &got)
	if got.Update != b64("u1") || got.Tag.I != hub.InstanceID || got.Tag.S == 0 {
		t.Fatalf("expected tagged first update, got %+v", got)
	}
	first := got.Tag
	_ = json.Unmarshal(fellow.next("yjs_update").Payload, &got)
	if got.Tag.S <= first.S {
		t.Fatalf("expected increasing sequence, got %d after %d", got.Tag.S, first.S)
	}

	// Invalid (non-base64) updates are ignored
	mentor.send("yjs_update", map[string]string{"update": "not base64!"})

	// A late joiner receives every stored update in its initial state
	late := dialHub(t, hub, sessionID, "Late", "candidate")
	var initPayload struct {
		State WorkspaceState `json:"state"`
	}
	_ = json.Unmarshal(late.next("init_state").Payload, &initPayload)
	if len(initPayload.State.Yjs) != 2 {
		t.Fatalf("expected 2 stored updates for the late joiner, got %d", len(initPayload.State.Yjs))
	}

	// A snapshot that has seen the first update replaces it, keeps the unseen one, and is acknowledged
	fellow.send("yjs_snapshot", map[string]any{
		"update":     b64("snapshot"),
		"seen":       map[string]uint64{first.I: first.S},
		"files":      map[string]string{"java": "class Main {}"},
		"scratchpad": "agenda",
	})
	var ack struct {
		Tag YjsTag `json:"tag"`
	}
	_ = json.Unmarshal(mentor.next("yjs_ack").Payload, &ack)
	if ack.Tag.S == 0 {
		t.Fatalf("expected snapshot ack with a tag")
	}
	fellow.next("yjs_ack") // the sender is acknowledged too

	room := hub.existingRoom(sessionID)
	room.Mu.RLock()
	entries := append([]YjsEntry(nil), room.State.Yjs...)
	files, notes := room.State.Code.Files["java"], room.State.Scratchpad
	room.Mu.RUnlock()
	if len(entries) != 2 || entries[0].U != b64("snapshot") || entries[1].U != b64("u2") {
		t.Fatalf("expected [snapshot, u2] after compaction, got %+v", entries)
	}
	if files != "class Main {}" || notes != "agenda" {
		t.Errorf("expected plain-text copies from the snapshot, got %q / %q", files, notes)
	}
}

func TestWhiteboardMergesElementsByVersion(t *testing.T) {
	current := json.RawMessage(`{"elements":[
		{"id":"a","version":3,"versionNonce":50,"index":"a0","x":1},
		{"id":"b","version":1,"versionNonce":10,"index":"a1","x":1}
	],"appState":{"theme":"light"}}`)
	incoming := json.RawMessage(`{"elements":[
		{"id":"a","version":2,"versionNonce":1,"index":"a0","x":2},
		{"id":"b","version":1,"versionNonce":5,"index":"a1","x":2},
		{"id":"c","version":1,"versionNonce":7,"index":"Zz","x":2}
	]}`)

	merged, err := mergeWhiteboard(current, incoming)
	if err != nil {
		t.Fatalf("merge failed: %v", err)
	}
	var scene struct {
		Elements []struct {
			ID string  `json:"id"`
			X  float64 `json:"x"`
		} `json:"elements"`
		AppState map[string]any `json:"appState"`
	}
	_ = json.Unmarshal(merged, &scene)
	if len(scene.Elements) != 3 {
		t.Fatalf("expected 3 elements, got %d", len(scene.Elements))
	}
	got := map[string]float64{}
	ids := []string{}
	for _, e := range scene.Elements {
		got[e.ID] = e.X
		ids = append(ids, e.ID)
	}
	if got["a"] != 1 {
		t.Errorf("older remote version must not overwrite element a")
	}
	if got["b"] != 2 {
		t.Errorf("equal version with lower nonce should win for element b")
	}
	if strings.Join(ids, ",") != "c,a,b" {
		t.Errorf("expected z-order c,a,b from fractional index, got %v", ids)
	}
	if scene.AppState["theme"] != "light" {
		t.Errorf("expected existing appState to be kept when the update has none")
	}
}

func TestMultipleInstancesShareWorkspaceThroughRedis(t *testing.T) {
	mr := miniredis.RunT(t)
	newHub := func() *Hub {
		broker, err := NewRedisBroker("redis://" + mr.Addr())
		if err != nil {
			t.Fatalf("broker: %v", err)
		}
		return NewHub(&mockStateRepo{}, newTestLogger(), Options{Broker: broker})
	}
	hubA, hubB := newHub(), newHub()
	defer hubA.Close()
	defer hubB.Close()
	time.Sleep(100 * time.Millisecond) // let both subscriptions start
	sessionID := uuid.New()

	mentor := dialHub(t, hubA, sessionID, "Mentor", "mentor")
	mentor.next("init_state")
	mentor.send("yjs_update", map[string]string{"update": b64("before-fellow")})
	time.Sleep(200 * time.Millisecond)

	// A fellow on another instance gets the mentor's earlier work through the state handoff
	// (the handoff can land before the fellow registers, in its initial state, or after, as state_sync)
	fellow := dialHub(t, hubB, sessionID, "Fellow", "candidate")
	var initial struct {
		State WorkspaceState `json:"state"`
	}
	_ = json.Unmarshal(fellow.next("init_state").Payload, &initial)
	if len(initial.State.Yjs) == 0 {
		_ = json.Unmarshal(fellow.next("state_sync").Payload, &initial)
	}
	if len(initial.State.Yjs) != 1 || initial.State.Yjs[0].U != b64("before-fellow") {
		t.Fatalf("expected state handoff with the mentor's update, got %+v", initial.State.Yjs)
	}

	// Live updates cross instances in both directions, keeping their original tags
	mentor.send("yjs_update", map[string]string{"update": b64("live")})
	var got struct {
		Update string `json:"update"`
		Tag    YjsTag `json:"tag"`
	}
	_ = json.Unmarshal(fellow.next("yjs_update").Payload, &got)
	if got.Update != b64("live") || got.Tag.I != hubA.InstanceID {
		t.Fatalf("expected mentor update tagged by instance A, got %+v", got)
	}
	fellow.send("whiteboard_update", map[string]any{"elements": []map[string]any{{"id": "r1", "version": 1, "versionNonce": 1}}})
	mentor.next("whiteboard_update")

	// Participants on both instances are listed together
	deadline := time.Now().Add(3 * time.Second)
	for {
		var p struct {
			Participants []Participant `json:"participants"`
		}
		_ = json.Unmarshal(mentor.next("participants_update").Payload, &p)
		if len(p.Participants) == 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("expected 2 participants across instances, got %d", len(p.Participants))
		}
	}
}
