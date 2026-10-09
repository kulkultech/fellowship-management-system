package sessionws

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Message struct {
	Type       string          `json:"type"`
	SenderID   string          `json:"sender_id,omitempty"`
	SenderName string          `json:"sender_name,omitempty"`
	SenderRole string          `json:"sender_role,omitempty"`
	Payload    json.RawMessage `json:"payload,omitempty"`
}

type Participant struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	AvatarColor string `json:"avatar_color"`
	JoinedAt    string `json:"joined_at"`
}

type CodeState struct {
	Language string            `json:"language"`
	Files    map[string]string `json:"files"`
	LastLogs json.RawMessage   `json:"last_logs,omitempty"`
}

// YjsTag identifies a stored Yjs update: the hub instance that stored it and its sequence there.
type YjsTag struct {
	I string `json:"i"`
	S uint64 `json:"s"`
}

// YjsEntry is a stored Yjs update (base64) for the shared code and notes document.
type YjsEntry struct {
	YjsTag
	U string `json:"u"`
}

type WorkspaceState struct {
	Whiteboard json.RawMessage `json:"whiteboard,omitempty"`
	Code       CodeState       `json:"code"`
	// Scratchpad and Code.Files are plain-text copies of the Yjs document, kept for readability.
	Scratchpad string `json:"scratchpad"`
	// Yjs holds the updates that rebuild the shared code and notes document.
	Yjs []YjsEntry `json:"yjs,omitempty"`
}

type StateRepository interface {
	GetWorkspaceState(ctx context.Context, sessionID uuid.UUID) (json.RawMessage, error)
	UpdateWorkspaceState(ctx context.Context, sessionID uuid.UUID, state json.RawMessage) error
}

type Client struct {
	ID          string
	SessionID   uuid.UUID
	UserID      string
	UserName    string
	UserRole    string
	AvatarColor string
	JoinedAt    string
	Conn        *websocket.Conn
	Send        chan []byte
	Room        *Room
	closeOnce   sync.Once
}

type remotePresence struct {
	participants []Participant
	at           time.Time
}

type Room struct {
	SessionID   uuid.UUID
	Clients     map[string]*Client
	State       WorkspaceState
	Dirty       bool
	LastSavedAt time.Time
	Mu          sync.RWMutex
	Hub         *Hub
	// remote holds participants connected to other hub instances, keyed by instance ID
	remote map[string]remotePresence
	closed bool
}

// Options configures a Hub.
type Options struct {
	// AllowedOrigins lists browser origins (scheme://host[:port]) that may open a workspace socket.
	// The API's own host is always allowed.
	AllowedOrigins []string
	// Broker relays messages between hub instances. Nil means single-instance mode.
	Broker Broker
}

type Hub struct {
	Rooms      map[uuid.UUID]*Room
	Mu         sync.RWMutex
	Repo       StateRepository
	Logger     *slog.Logger
	StopChan   chan struct{}
	InstanceID string

	seq            atomic.Uint64
	broker         Broker
	allowedOrigins map[string]bool
	upgrader       websocket.Upgrader
	pubCh          chan []byte
}

const (
	presenceInterval = 15 * time.Second
	presenceTTL      = 45 * time.Second
	sendBufferSize   = 1024
	maxYjsUpdateSize = 2 * 1024 * 1024
)

func NewHub(repo StateRepository, logger *slog.Logger, opts ...Options) *Hub {
	var opt Options
	if len(opts) > 0 {
		opt = opts[0]
	}
	h := &Hub{
		Rooms:          make(map[uuid.UUID]*Room),
		Repo:           repo,
		Logger:         logger,
		StopChan:       make(chan struct{}),
		InstanceID:     strings.ReplaceAll(uuid.New().String(), "-", "")[:12],
		broker:         opt.Broker,
		allowedOrigins: make(map[string]bool),
		pubCh:          make(chan []byte, 4096),
	}
	for _, o := range opt.AllowedOrigins {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			h.allowedOrigins[strings.ToLower(o)] = true
		}
	}
	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024 * 64,
		WriteBufferSize: 1024 * 64,
		CheckOrigin:     h.checkOrigin,
	}

	go h.persistenceLoop()
	if h.broker != nil {
		go h.publishLoop()
		go func() {
			if err := h.broker.Subscribe(context.Background(), h.handleEnvelope); err != nil {
				h.Logger.Error("session ws: broker subscription ended", "error", err)
			}
		}()
	}
	return h
}

// checkOrigin accepts same-host connections, configured frontend origins, and non-browser clients.
func (h *Hub) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	return h.allowedOrigins[strings.ToLower(u.Scheme+"://"+u.Host)]
}

func (h *Hub) Close() {
	close(h.StopChan)
	h.FlushAll()
	if h.broker != nil {
		_ = h.broker.Close()
	}
}

func (h *Hub) nextTag() YjsTag {
	return YjsTag{I: h.InstanceID, S: h.seq.Add(1)}
}

func (h *Hub) loadState(sessionID uuid.UUID) WorkspaceState {
	state := WorkspaceState{Code: CodeState{Language: "java", Files: make(map[string]string)}}
	if h.Repo == nil {
		return state
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	raw, err := h.Repo.GetWorkspaceState(ctx, sessionID)
	if err != nil || len(raw) <= 2 {
		return state
	}
	var loaded WorkspaceState
	if err := json.Unmarshal(raw, &loaded); err != nil {
		return state
	}
	if loaded.Code.Files == nil {
		loaded.Code.Files = make(map[string]string)
	}
	if loaded.Code.Language == "" {
		loaded.Code.Language = "java"
	}
	return loaded
}

func (h *Hub) getOrCreateRoom(sessionID uuid.UUID) *Room {
	h.Mu.Lock()
	if room, ok := h.Rooms[sessionID]; ok {
		h.Mu.Unlock()
		return room
	}
	room := &Room{
		SessionID: sessionID,
		Clients:   make(map[string]*Client),
		State:     h.loadState(sessionID),
		Hub:       h,
		remote:    make(map[string]remotePresence),
	}
	h.Rooms[sessionID] = room
	h.Mu.Unlock()

	// Ask other instances hosting this session for their newer in-memory state
	h.publish(envelope{Kind: envStateRequest, Session: sessionID})
	return room
}

func (h *Hub) ServeWebSocket(w http.ResponseWriter, r *http.Request, sessionID uuid.UUID, userID, userName, userRole string) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.Logger.Error("websocket upgrade failed", "error", err, "session_id", sessionID)
		return
	}

	// Pick a friendly color based on name/role
	colors := []string{"#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"}
	colorIdx := 0
	for _, c := range userName {
		colorIdx = (colorIdx + int(c)) % len(colors)
	}

	client := &Client{
		ID:          uuid.New().String(),
		SessionID:   sessionID,
		UserID:      userID,
		UserName:    userName,
		UserRole:    userRole,
		AvatarColor: colors[colorIdx],
		JoinedAt:    time.Now().Format(time.RFC3339),
		Conn:        conn,
		Send:        make(chan []byte, sendBufferSize),
	}

	// A room can be closed between lookup and registration when its last client leaves; retry then
	for {
		room := h.getOrCreateRoom(sessionID)
		if room.registerClient(client) {
			break
		}
	}

	go client.writePump()
	go client.readPump()
}

// registerClient adds the client and sends it the current state. It returns false if the room was closed.
func (r *Room) registerClient(c *Client) bool {
	r.Mu.Lock()
	if r.closed {
		r.Mu.Unlock()
		return false
	}
	c.Room = r
	r.Clients[c.ID] = c
	clientCount := len(r.Clients)
	participants := r.participantsLocked()

	initPayload, _ := json.Marshal(map[string]any{
		"my_id":        c.ID,
		"state":        r.State,
		"participants": participants,
	})
	r.sendLocked(c, Message{Type: "init_state", Payload: initPayload})

	joinPayload, _ := json.Marshal(map[string]any{
		"participant":  c.participant(),
		"participants": participants,
	})
	r.broadcastLocked(c.ID, Message{
		Type:       "participant_joined",
		SenderID:   c.ID,
		SenderName: c.UserName,
		SenderRole: c.UserRole,
		Payload:    joinPayload,
	})
	local := r.localParticipantsLocked()
	r.Mu.Unlock()

	r.Hub.Logger.Info("session ws: client connected",
		"session_id", r.SessionID,
		"client_id", c.ID,
		"user_name", c.UserName,
		"total_clients", clientCount,
	)
	r.Hub.publish(envelope{Kind: envPresence, Session: r.SessionID, Participants: local})
	return true
}

func (r *Room) unregisterClient(c *Client) {
	r.Mu.Lock()
	if _, ok := r.Clients[c.ID]; ok {
		delete(r.Clients, c.ID)
		close(c.Send)
	}
	remaining := len(r.Clients)
	participants := r.participantsLocked()
	leftPayload, _ := json.Marshal(map[string]any{
		"client_id":    c.ID,
		"user_id":      c.UserID,
		"participants": participants,
	})
	r.broadcastLocked("", Message{
		Type:       "participant_left",
		SenderID:   c.ID,
		SenderName: c.UserName,
		Payload:    leftPayload,
	})
	local := r.localParticipantsLocked()
	r.Mu.Unlock()

	r.Hub.Logger.Info("session ws: client disconnected",
		"session_id", r.SessionID,
		"client_id", c.ID,
		"user_name", c.UserName,
		"remaining", remaining,
	)
	r.Hub.publish(envelope{Kind: envPresence, Session: r.SessionID, Participants: local})

	if remaining == 0 {
		r.flushToDatabase()
		r.Hub.closeRoomIfEmpty(r)
	}
}

// closeRoomIfEmpty drops an idle room so the next join reloads the persisted state.
func (h *Hub) closeRoomIfEmpty(r *Room) {
	h.Mu.Lock()
	defer h.Mu.Unlock()
	r.Mu.Lock()
	defer r.Mu.Unlock()
	if len(r.Clients) > 0 || r.closed {
		return
	}
	if r.Dirty {
		// A remote update arrived after the flush; keep the room until the next persistence tick
		return
	}
	r.closed = true
	if h.Rooms[r.SessionID] == r {
		delete(h.Rooms, r.SessionID)
	}
}

func (c *Client) participant() Participant {
	return Participant{
		ID:          c.ID,
		UserID:      c.UserID,
		Name:        c.UserName,
		Role:        c.UserRole,
		AvatarColor: c.AvatarColor,
		JoinedAt:    c.JoinedAt,
	}
}

func (r *Room) localParticipantsLocked() []Participant {
	list := make([]Participant, 0, len(r.Clients))
	for _, cl := range r.Clients {
		list = append(list, cl.participant())
	}
	sort.Slice(list, func(i, j int) bool { return list[i].JoinedAt < list[j].JoinedAt })
	return list
}

// participantsLocked lists participants on this instance plus those reported by other instances.
func (r *Room) participantsLocked() []Participant {
	list := r.localParticipantsLocked()
	for _, p := range r.remote {
		list = append(list, p.participants...)
	}
	return list
}

// buildParticipantsListLocked is kept for callers that only need local participants.
func (r *Room) buildParticipantsListLocked() []Participant {
	return r.localParticipantsLocked()
}

// sendLocked queues a message for one client. A client that cannot keep up is disconnected so it
// reconnects and receives a fresh state instead of silently missing updates.
func (r *Room) sendLocked(c *Client, msg Message) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}
	r.enqueueLocked(c, bytes)
}

func (r *Room) enqueueLocked(c *Client, bytes []byte) {
	select {
	case c.Send <- bytes:
	default:
		c.closeOnce.Do(func() {
			r.Hub.Logger.Warn("session ws: client too slow, disconnecting", "session_id", r.SessionID, "client_id", c.ID)
			go c.Conn.Close()
		})
	}
}

func (r *Room) broadcastLocked(excludeID string, msg Message) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}
	for id, client := range r.Clients {
		if id == excludeID {
			continue
		}
		r.enqueueLocked(client, bytes)
	}
}

func (r *Room) broadcastExcept(excludeID string, msg Message) {
	r.Mu.RLock()
	defer r.Mu.RUnlock()
	r.broadcastLocked(excludeID, msg)
}

// handleMessage processes a message from a local client: it validates and tags it, applies it to the
// room state, delivers it to local clients, and relays it to other instances, all in one ordered step.
func (r *Room) handleMessage(client *Client, msg Message) {
	msg.SenderID = client.ID
	msg.SenderName = client.UserName
	msg.SenderRole = client.UserRole

	switch msg.Type {
	case "yjs_update":
		var in struct {
			Update string `json:"update"`
		}
		if json.Unmarshal(msg.Payload, &in) != nil || !validYjsUpdate(in.Update) {
			return
		}
		msg.Payload, _ = json.Marshal(map[string]any{"update": in.Update, "tag": r.Hub.nextTag()})

	case "yjs_snapshot":
		var in struct {
			Update     string            `json:"update"`
			Seen       map[string]uint64 `json:"seen"`
			Files      map[string]string `json:"files,omitempty"`
			Scratchpad *string           `json:"scratchpad,omitempty"`
		}
		if json.Unmarshal(msg.Payload, &in) != nil || !validYjsUpdate(in.Update) {
			return
		}
		msg.Payload, _ = json.Marshal(map[string]any{
			"update":     in.Update,
			"tag":        r.Hub.nextTag(),
			"seen":       in.Seen,
			"files":      in.Files,
			"scratchpad": in.Scratchpad,
		})

	case "whiteboard_update", "language_change", "code_run", "code_update", "scratchpad_update",
		"tab_change", "cursor_move", "presence_ping":
	default:
		return
	}

	r.Mu.Lock()
	if r.closed {
		r.Mu.Unlock()
		return
	}
	r.applyLocked(msg)
	r.deliverLocked(msg, client.ID)
	// Enqueue for relay while holding the lock so other instances see this room's messages in order
	r.Hub.publish(envelope{Kind: envMessage, Session: r.SessionID, Message: &msg})
	r.Mu.Unlock()
}

// handleRemoteMessage applies a message relayed from another instance.
func (r *Room) handleRemoteMessage(msg Message) {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	if r.closed {
		return
	}
	r.applyLocked(msg)
	r.deliverLocked(msg, "")
}

func validYjsUpdate(b64 string) bool {
	if b64 == "" || len(b64) > maxYjsUpdateSize {
		return false
	}
	_, err := base64.StdEncoding.DecodeString(b64)
	return err == nil
}

func (r *Room) applyLocked(msg Message) {
	switch msg.Type {
	case "yjs_update":
		var in struct {
			Update string `json:"update"`
			Tag    YjsTag `json:"tag"`
		}
		if json.Unmarshal(msg.Payload, &in) == nil {
			r.State.Yjs = append(r.State.Yjs, YjsEntry{YjsTag: in.Tag, U: in.Update})
			r.Dirty = true
		}

	case "yjs_snapshot":
		var in struct {
			Update     string            `json:"update"`
			Tag        YjsTag            `json:"tag"`
			Seen       map[string]uint64 `json:"seen"`
			Files      map[string]string `json:"files"`
			Scratchpad *string           `json:"scratchpad"`
		}
		if json.Unmarshal(msg.Payload, &in) != nil {
			return
		}
		// The snapshot contains every update its sender had seen, so those entries can be dropped
		kept := []YjsEntry{{YjsTag: in.Tag, U: in.Update}}
		for _, e := range r.State.Yjs {
			if seen, ok := in.Seen[e.I]; ok && e.S <= seen {
				continue
			}
			kept = append(kept, e)
		}
		r.State.Yjs = kept
		for lang, code := range in.Files {
			r.State.Code.Files[lang] = code
		}
		if in.Scratchpad != nil {
			r.State.Scratchpad = *in.Scratchpad
		}
		r.Dirty = true

	case "whiteboard_update":
		merged, err := mergeWhiteboard(r.State.Whiteboard, msg.Payload)
		if err == nil {
			r.State.Whiteboard = merged
			r.Dirty = true
		}

	case "code_update":
		// Legacy full-text update from clients that predate shared editing
		var in struct {
			Language string `json:"language"`
			Code     string `json:"code"`
		}
		if json.Unmarshal(msg.Payload, &in) == nil && in.Language != "" {
			r.State.Code.Files[in.Language] = in.Code
			r.Dirty = true
		}

	case "language_change":
		var in struct {
			Language string `json:"language"`
		}
		if json.Unmarshal(msg.Payload, &in) == nil && in.Language != "" {
			r.State.Code.Language = in.Language
			r.Dirty = true
		}

	case "code_run":
		r.State.Code.LastLogs = msg.Payload

	case "scratchpad_update":
		// Legacy full-text update from clients that predate shared editing
		var in struct {
			Notes string `json:"notes"`
		}
		if json.Unmarshal(msg.Payload, &in) == nil {
			r.State.Scratchpad = in.Notes
			r.Dirty = true
		}
	}
}

// deliverLocked sends a processed message to this instance's clients.
func (r *Room) deliverLocked(msg Message, excludeID string) {
	switch msg.Type {
	case "yjs_snapshot":
		// Everyone already has the snapshot's content; tell them its tag so their seen-state advances
		var in struct {
			Tag YjsTag `json:"tag"`
		}
		_ = json.Unmarshal(msg.Payload, &in)
		ack, _ := json.Marshal(map[string]any{"tag": in.Tag})
		r.broadcastLocked("", Message{Type: "yjs_ack", Payload: ack})
	default:
		r.broadcastLocked(excludeID, msg)
	}
}

func (r *Room) flushToDatabase() {
	r.Mu.Lock()
	if !r.Dirty {
		r.Mu.Unlock()
		return
	}
	r.Dirty = false
	bytes, err := json.Marshal(r.State)
	r.Mu.Unlock()

	if err != nil || r.Hub.Repo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := r.Hub.Repo.UpdateWorkspaceState(ctx, r.SessionID, bytes); err != nil {
		r.Hub.Logger.Error("session ws: failed to flush workspace state to db", "session_id", r.SessionID, "error", err)
		r.Mu.Lock()
		r.Dirty = true
		r.Mu.Unlock()
	} else {
		r.Hub.Logger.Debug("session ws: flushed workspace state to db", "session_id", r.SessionID)
	}
}

func (h *Hub) roomsSnapshot() []*Room {
	h.Mu.RLock()
	defer h.Mu.RUnlock()
	rooms := make([]*Room, 0, len(h.Rooms))
	for _, r := range h.Rooms {
		rooms = append(rooms, r)
	}
	return rooms
}

func (h *Hub) FlushAll() {
	for _, r := range h.roomsSnapshot() {
		r.flushToDatabase()
	}
}

func (h *Hub) persistenceLoop() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	presenceTicker := time.NewTicker(presenceInterval)
	defer presenceTicker.Stop()

	for {
		select {
		case <-h.StopChan:
			return
		case <-ticker.C:
			for _, r := range h.roomsSnapshot() {
				r.flushToDatabase()
				r.Mu.RLock()
				empty := len(r.Clients) == 0
				r.Mu.RUnlock()
				if empty {
					h.closeRoomIfEmpty(r)
				}
			}
		case <-presenceTicker.C:
			if h.broker != nil {
				h.refreshPresence()
			}
		}
	}
}

// refreshPresence re-announces local participants and expires participants from silent instances.
func (h *Hub) refreshPresence() {
	now := time.Now()
	for _, r := range h.roomsSnapshot() {
		r.Mu.Lock()
		local := r.localParticipantsLocked()
		changed := false
		for inst, p := range r.remote {
			if now.Sub(p.at) > presenceTTL {
				delete(r.remote, inst)
				changed = true
			}
		}
		if changed {
			r.broadcastParticipantsLocked()
		}
		r.Mu.Unlock()
		if len(local) > 0 {
			h.publish(envelope{Kind: envPresence, Session: r.SessionID, Participants: local})
		}
	}
}

func (r *Room) broadcastParticipantsLocked() {
	payload, _ := json.Marshal(map[string]any{"participants": r.participantsLocked()})
	r.broadcastLocked("", Message{Type: "participants_update", Payload: payload})
}

// Client pump methods

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1024 * 1024 * 4 // 4MB for rich Excalidraw element trees
)

func (c *Client) sendMessage(msg Message) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case c.Send <- bytes:
	default:
	}
}

func (c *Client) readPump() {
	defer func() {
		c.Room.unregisterClient(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, messageBytes, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(messageBytes, &msg); err != nil {
			continue
		}

		c.Room.handleMessage(c, msg)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			// Flush queued messages if any (newline-separated; clients split frames on '\n')
			n := len(c.Send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
