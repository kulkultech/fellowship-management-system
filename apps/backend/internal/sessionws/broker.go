package sessionws

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Broker relays workspace messages between backend instances so participants connected to
// different instances share the same session.
type Broker interface {
	Publish(ctx context.Context, data []byte) error
	// Subscribe delivers every published message (including this instance's own) until ctx ends.
	Subscribe(ctx context.Context, handle func(data []byte)) error
	Close() error
}

const (
	envMessage      = "msg"
	envPresence     = "presence"
	envStateRequest = "state_request"
	envStateReply   = "state_reply"
)

type envelope struct {
	Origin       string          `json:"origin"`
	Kind         string          `json:"kind"`
	Session      uuid.UUID       `json:"session"`
	Target       string          `json:"target,omitempty"`
	Message      *Message        `json:"message,omitempty"`
	Participants []Participant   `json:"participants,omitempty"`
	State        *WorkspaceState `json:"state,omitempty"`
}

// publish queues an envelope for relay; it is a no-op in single-instance mode.
func (h *Hub) publish(env envelope) {
	if h.broker == nil {
		return
	}
	env.Origin = h.InstanceID
	data, err := json.Marshal(env)
	if err != nil {
		return
	}
	h.pubCh <- data
}

// publishLoop sends envelopes one at a time so other instances receive them in order.
func (h *Hub) publishLoop() {
	for {
		select {
		case <-h.StopChan:
			return
		case data := <-h.pubCh:
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := h.broker.Publish(ctx, data); err != nil {
				h.Logger.Error("session ws: failed to relay message", "error", err)
			}
			cancel()
		}
	}
}

func (h *Hub) existingRoom(sessionID uuid.UUID) *Room {
	h.Mu.RLock()
	defer h.Mu.RUnlock()
	return h.Rooms[sessionID]
}

// handleEnvelope processes a relayed envelope from another instance.
func (h *Hub) handleEnvelope(data []byte) {
	var env envelope
	if err := json.Unmarshal(data, &env); err != nil || env.Origin == h.InstanceID {
		return
	}
	if env.Target != "" && env.Target != h.InstanceID {
		return
	}
	room := h.existingRoom(env.Session)
	if room == nil {
		return
	}

	switch env.Kind {
	case envMessage:
		if env.Message != nil {
			room.handleRemoteMessage(*env.Message)
		}

	case envPresence:
		room.Mu.Lock()
		if len(env.Participants) == 0 {
			delete(room.remote, env.Origin)
		} else {
			room.remote[env.Origin] = remotePresence{participants: env.Participants, at: time.Now()}
		}
		room.broadcastParticipantsLocked()
		room.Mu.Unlock()

	case envStateRequest:
		room.Mu.RLock()
		if room.closed {
			room.Mu.RUnlock()
			return
		}
		state := room.State
		data, err := json.Marshal(state)
		local := room.localParticipantsLocked()
		room.Mu.RUnlock()
		if err != nil {
			return
		}
		var copied WorkspaceState
		if json.Unmarshal(data, &copied) != nil {
			return
		}
		h.publish(envelope{Kind: envStateReply, Session: env.Session, Target: env.Origin, State: &copied})
		if len(local) > 0 {
			h.publish(envelope{Kind: envPresence, Session: env.Session, Participants: local})
		}

	case envStateReply:
		if env.State != nil {
			room.mergeRemoteState(*env.State)
		}
	}
}

// mergeRemoteState folds another instance's newer in-memory state into this room and sends the
// result to local clients, who merge it idempotently.
func (r *Room) mergeRemoteState(remote WorkspaceState) {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	if r.closed {
		return
	}

	known := make(map[YjsTag]bool, len(r.State.Yjs))
	for _, e := range r.State.Yjs {
		known[e.YjsTag] = true
	}
	for _, e := range remote.Yjs {
		if !known[e.YjsTag] {
			r.State.Yjs = append(r.State.Yjs, e)
			known[e.YjsTag] = true
		}
	}
	if len(remote.Whiteboard) > 0 {
		if merged, err := mergeWhiteboard(r.State.Whiteboard, remote.Whiteboard); err == nil {
			r.State.Whiteboard = merged
		}
	}
	if remote.Code.Language != "" {
		r.State.Code.Language = remote.Code.Language
	}
	for lang, code := range remote.Code.Files {
		r.State.Code.Files[lang] = code
	}
	if remote.Scratchpad != "" {
		r.State.Scratchpad = remote.Scratchpad
	}
	if len(remote.Code.LastLogs) > 0 {
		r.State.Code.LastLogs = remote.Code.LastLogs
	}
	r.Dirty = true

	payload, _ := json.Marshal(map[string]any{"state": r.State})
	r.broadcastLocked("", Message{Type: "state_sync", Payload: payload})
}

// whiteboardScene is the stored whiteboard payload.
type whiteboardScene struct {
	Elements []json.RawMessage `json:"elements"`
	AppState json.RawMessage   `json:"appState,omitempty"`
}

type elementMeta struct {
	ID           string `json:"id"`
	Version      int64  `json:"version"`
	VersionNonce int64  `json:"versionNonce"`
	Index        string `json:"index"`
}

// mergeWhiteboard merges incoming Excalidraw elements into the stored scene element by element,
// using Excalidraw's own rule: the higher version wins, and on a tie the lower versionNonce wins.
func mergeWhiteboard(current, incoming json.RawMessage) (json.RawMessage, error) {
	var in whiteboardScene
	if err := json.Unmarshal(incoming, &in); err != nil {
		return nil, fmt.Errorf("whiteboard: decode update: %w", err)
	}
	var cur whiteboardScene
	if len(current) > 0 {
		_ = json.Unmarshal(current, &cur)
	}

	type stored struct {
		raw  json.RawMessage
		meta elementMeta
	}
	byID := make(map[string]stored, len(cur.Elements)+len(in.Elements))
	order := make([]string, 0, len(cur.Elements)+len(in.Elements))
	add := func(raw json.RawMessage) {
		var m elementMeta
		if json.Unmarshal(raw, &m) != nil || m.ID == "" {
			return
		}
		existing, ok := byID[m.ID]
		if !ok {
			order = append(order, m.ID)
			byID[m.ID] = stored{raw: raw, meta: m}
			return
		}
		if m.Version > existing.meta.Version ||
			(m.Version == existing.meta.Version && m.VersionNonce < existing.meta.VersionNonce) {
			byID[m.ID] = stored{raw: raw, meta: m}
		}
	}
	for _, el := range cur.Elements {
		add(el)
	}
	for _, el := range in.Elements {
		add(el)
	}

	// Keep Excalidraw's fractional z-order when present
	sort.SliceStable(order, func(i, j int) bool {
		a, b := byID[order[i]].meta.Index, byID[order[j]].meta.Index
		if a == "" || b == "" {
			return false
		}
		return a < b
	})

	out := whiteboardScene{Elements: make([]json.RawMessage, 0, len(order)), AppState: cur.AppState}
	for _, id := range order {
		out.Elements = append(out.Elements, byID[id].raw)
	}
	if len(in.AppState) > 0 && string(in.AppState) != "null" {
		out.AppState = in.AppState
	}
	return json.Marshal(out)
}

// RedisBroker relays workspace messages through a Redis pub/sub channel.
type RedisBroker struct {
	client  *redis.Client
	channel string
}

// NewRedisBroker connects to Redis using a redis:// or rediss:// URL.
func NewRedisBroker(redisURL string) (*RedisBroker, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("session ws: invalid REDIS_URL: %w", err)
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("session ws: connect to redis: %w", err)
	}
	return &RedisBroker{client: client, channel: "fellowhire:session-workspace"}, nil
}

func (b *RedisBroker) Publish(ctx context.Context, data []byte) error {
	return b.client.Publish(ctx, b.channel, data).Err()
}

func (b *RedisBroker) Subscribe(ctx context.Context, handle func(data []byte)) error {
	sub := b.client.Subscribe(ctx, b.channel)
	defer sub.Close()
	if _, err := sub.Receive(ctx); err != nil {
		return fmt.Errorf("session ws: subscribe: %w", err)
	}
	ch := sub.Channel(redis.WithChannelSize(4096))
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			handle([]byte(msg.Payload))
		}
	}
}

func (b *RedisBroker) Close() error {
	return b.client.Close()
}
