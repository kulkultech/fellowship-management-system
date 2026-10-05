package sessionws

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 64,
	WriteBufferSize: 1024 * 64,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all cross-origin connections from frontend
	},
}

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
	LastLogs json.RawMessage  `json:"last_logs,omitempty"`
}

type WorkspaceState struct {
	Whiteboard json.RawMessage `json:"whiteboard,omitempty"`
	Code       CodeState       `json:"code"`
	Scratchpad string          `json:"scratchpad"`
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
	Conn        *websocket.Conn
	Send        chan []byte
	Room        *Room
}

type Room struct {
	SessionID   uuid.UUID
	Clients     map[string]*Client
	State       WorkspaceState
	Dirty       bool
	LastSavedAt time.Time
	Mu          sync.RWMutex
	Hub         *Hub
}

type Hub struct {
	Rooms    map[uuid.UUID]*Room
	Mu       sync.RWMutex
	Repo     StateRepository
	Logger   *slog.Logger
	StopChan chan struct{}
}

func NewHub(repo StateRepository, logger *slog.Logger) *Hub {
	h := &Hub{
		Rooms:    make(map[uuid.UUID]*Room),
		Repo:     repo,
		Logger:   logger,
		StopChan: make(chan struct{}),
	}
	go h.persistenceLoop()
	return h
}

func (h *Hub) Close() {
	close(h.StopChan)
	h.FlushAll()
}

func (h *Hub) getOrCreateRoom(sessionID uuid.UUID) *Room {
	h.Mu.Lock()
	defer h.Mu.Unlock()

	if room, ok := h.Rooms[sessionID]; ok {
		return room
	}

	room := &Room{
		SessionID: sessionID,
		Clients:   make(map[string]*Client),
		State: WorkspaceState{
			Code: CodeState{
				Language: "java",
				Files:    make(map[string]string),
			},
			Scratchpad: "",
		},
		Hub: h,
	}

	// Try loading existing state from database
	if h.Repo != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if raw, err := h.Repo.GetWorkspaceState(ctx, sessionID); err == nil && len(raw) > 2 {
			var loaded WorkspaceState
			if err := json.Unmarshal(raw, &loaded); err == nil {
				if loaded.Code.Files == nil {
					loaded.Code.Files = make(map[string]string)
				}
				if loaded.Code.Language == "" {
					loaded.Code.Language = "java"
				}
				room.State = loaded
			}
		}
	}

	h.Rooms[sessionID] = room
	return room
}

func (h *Hub) ServeWebSocket(w http.ResponseWriter, r *http.Request, sessionID uuid.UUID, userID, userName, userRole string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.Logger.Error("websocket upgrade failed", "error", err, "session_id", sessionID)
		return
	}

	room := h.getOrCreateRoom(sessionID)

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
		Conn:        conn,
		Send:        make(chan []byte, 256),
		Room:        room,
	}

	room.registerClient(client)

	go client.writePump()
	go client.readPump()
}

func (r *Room) registerClient(c *Client) {
	r.Mu.Lock()
	r.Clients[c.ID] = c
	clientCount := len(r.Clients)

	// Build participants list
	participants := r.buildParticipantsListLocked()
	stateSnapshot := r.State
	r.Mu.Unlock()

	r.Hub.Logger.Info("session ws: client connected",
		"session_id", r.SessionID,
		"client_id", c.ID,
		"user_name", c.UserName,
		"total_clients", clientCount,
	)

	// Send initial state to the newly joined client
	initPayload, _ := json.Marshal(map[string]any{
		"my_id":        c.ID,
		"state":        stateSnapshot,
		"participants": participants,
	})
	c.sendMessage(Message{
		Type:    "init_state",
		Payload: initPayload,
	})

	// Broadcast participant_joined to other clients
	newPart := Participant{
		ID:          c.ID,
		UserID:      c.UserID,
		Name:        c.UserName,
		Role:        c.UserRole,
		AvatarColor: c.AvatarColor,
		JoinedAt:    time.Now().Format(time.RFC3339),
	}
	joinPayload, _ := json.Marshal(map[string]any{
		"participant":  newPart,
		"participants": participants,
	})
	r.broadcastExcept(c.ID, Message{
		Type:       "participant_joined",
		SenderID:   c.ID,
		SenderName: c.UserName,
		SenderRole: c.UserRole,
		Payload:    joinPayload,
	})
}

func (r *Room) unregisterClient(c *Client) {
	r.Mu.Lock()
	if _, ok := r.Clients[c.ID]; ok {
		delete(r.Clients, c.ID)
		close(c.Send)
	}
	remaining := len(r.Clients)
	participants := r.buildParticipantsListLocked()
	r.Mu.Unlock()

	r.Hub.Logger.Info("session ws: client disconnected",
		"session_id", r.SessionID,
		"client_id", c.ID,
		"user_name", c.UserName,
		"remaining", remaining,
	)

	// Broadcast participant_left
	leftPayload, _ := json.Marshal(map[string]any{
		"client_id":    c.ID,
		"user_id":      c.UserID,
		"participants": participants,
	})
	r.broadcastExcept("", Message{
		Type:       "participant_left",
		SenderID:   c.ID,
		SenderName: c.UserName,
		Payload:    leftPayload,
	})

	// If room is empty, flush to database
	if remaining == 0 {
		r.flushToDatabase()
	}
}

func (r *Room) buildParticipantsListLocked() []Participant {
	list := make([]Participant, 0, len(r.Clients))
	for _, cl := range r.Clients {
		list = append(list, Participant{
			ID:          cl.ID,
			UserID:      cl.UserID,
			Name:        cl.UserName,
			Role:        cl.UserRole,
			AvatarColor: cl.AvatarColor,
			JoinedAt:    time.Now().Format(time.RFC3339),
		})
	}
	return list
}

func (r *Room) broadcastExcept(excludeID string, msg Message) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	r.Mu.RLock()
	defer r.Mu.RUnlock()

	for id, client := range r.Clients {
		if id == excludeID {
			continue
		}
		select {
		case client.Send <- bytes:
		default:
			// Buffer full, skip
		}
	}
}

func (r *Room) handleMessage(client *Client, msg Message) {
	msg.SenderID = client.ID
	msg.SenderName = client.UserName
	msg.SenderRole = client.UserRole

	switch msg.Type {
	case "whiteboard_update":
		// Payload: { elements, appState }
		r.Mu.Lock()
		r.State.Whiteboard = msg.Payload
		r.Dirty = true
		r.Mu.Unlock()
		r.broadcastExcept(client.ID, msg)

	case "code_update":
		// Payload: { language: string, code: string }
		var update struct {
			Language string `json:"language"`
			Code     string `json:"code"`
		}
		if err := json.Unmarshal(msg.Payload, &update); err == nil && update.Language != "" {
			r.Mu.Lock()
			if r.State.Code.Files == nil {
				r.State.Code.Files = make(map[string]string)
			}
			r.State.Code.Files[update.Language] = update.Code
			r.Dirty = true
			r.Mu.Unlock()
		}
		r.broadcastExcept(client.ID, msg)

	case "language_change":
		// Payload: { language: string }
		var update struct {
			Language string `json:"language"`
		}
		if err := json.Unmarshal(msg.Payload, &update); err == nil && update.Language != "" {
			r.Mu.Lock()
			r.State.Code.Language = update.Language
			r.Dirty = true
			r.Mu.Unlock()
		}
		r.broadcastExcept(client.ID, msg)

	case "code_run":
		// Payload: { language: string, logs: []LogItem }
		r.Mu.Lock()
		r.State.Code.LastLogs = msg.Payload
		r.Mu.Unlock()
		r.broadcastExcept(client.ID, msg)

	case "scratchpad_update":
		// Payload: { notes: string }
		var update struct {
			Notes string `json:"notes"`
		}
		if err := json.Unmarshal(msg.Payload, &update); err == nil {
			r.Mu.Lock()
			r.State.Scratchpad = update.Notes
			r.Dirty = true
			r.Mu.Unlock()
		}
		r.broadcastExcept(client.ID, msg)

	case "tab_change", "cursor_move", "presence_ping":
		// Ephemeral presence broadcast
		r.broadcastExcept(client.ID, msg)
	}
}

func (r *Room) flushToDatabase() {
	r.Mu.Lock()
	if !r.Dirty {
		r.Mu.Unlock()
		return
	}
	r.Dirty = false
	stateCopy := r.State
	r.Mu.Unlock()

	if r.Hub.Repo == nil {
		return
	}

	bytes, err := json.Marshal(stateCopy)
	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := r.Hub.Repo.UpdateWorkspaceState(ctx, r.SessionID, bytes); err != nil {
		r.Hub.Logger.Error("session ws: failed to flush workspace state to db", "session_id", r.SessionID, "error", err)
	} else {
		r.Hub.Logger.Debug("session ws: flushed workspace state to db", "session_id", r.SessionID)
	}
}

func (h *Hub) FlushAll() {
	h.Mu.RLock()
	rooms := make([]*Room, 0, len(h.Rooms))
	for _, r := range h.Rooms {
		rooms = append(rooms, r)
	}
	h.Mu.RUnlock()

	for _, r := range rooms {
		r.flushToDatabase()
	}
}

func (h *Hub) persistenceLoop() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-h.StopChan:
			return
		case <-ticker.C:
			h.Mu.RLock()
			rooms := make([]*Room, 0, len(h.Rooms))
			for _, r := range h.Rooms {
				rooms = append(rooms, r)
			}
			h.Mu.RUnlock()

			for _, r := range rooms {
				if r.Dirty {
					r.flushToDatabase()
				}
			}
		}
	}
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

			// Flush queued messages if any
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
