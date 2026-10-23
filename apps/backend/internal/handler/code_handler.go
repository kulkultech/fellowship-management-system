package handler

import (
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/coderunner"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
)

const (
	codeRunsPerWindow = 20
	codeRunWindow     = time.Minute
)

// CodeHandler runs workspace code files on the Piston code runner.
type CodeHandler struct {
	runner *coderunner.Client

	mu   sync.Mutex
	runs map[uuid.UUID][]time.Time // recent runs per user, for rate limiting
}

func NewCodeHandler(runner *coderunner.Client) *CodeHandler {
	return &CodeHandler{runner: runner, runs: map[uuid.UUID][]time.Time{}}
}

// allow reports whether the user may run code now (a sliding window per user).
func (h *CodeHandler) allow(user uuid.UUID) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	cutoff := time.Now().Add(-codeRunWindow)
	recent := h.runs[user][:0]
	for _, t := range h.runs[user] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= codeRunsPerWindow {
		h.runs[user] = recent
		return false
	}
	h.runs[user] = append(recent, time.Now())
	return true
}

// Languages handles GET /api/v1/code/languages: which languages can run on the server right now.
func (h *CodeHandler) Languages(w http.ResponseWriter, r *http.Request) {
	ids, err := h.runner.Available(r.Context())
	if err != nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"configured": h.runner.Configured(), "languages": []string{}, "error": "the code runner is not reachable"})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"configured": h.runner.Configured(), "languages": ids})
}

type codeRunRequest struct {
	Language string `json:"language"`
	FileName string `json:"file_name"`
	Code     string `json:"code"`
	Stdin    string `json:"stdin,omitempty"`
}

// Run handles POST /api/v1/code/run: compiles and runs one file in the sandbox.
func (h *CodeHandler) Run(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req codeRunRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if _, ok := coderunner.Languages[req.Language]; !ok {
		httpx.Error(w, http.StatusBadRequest, "this language cannot be run")
		return
	}
	if len(req.Code) > coderunner.MaxCodeBytes {
		httpx.Error(w, http.StatusBadRequest, "the file is too large to run (max 64 KB)")
		return
	}
	if len(req.Stdin) > coderunner.MaxStdinBytes {
		httpx.Error(w, http.StatusBadRequest, "input is too large (max 8 KB)")
		return
	}
	name := strings.TrimSpace(req.FileName)
	if name == "" || len(name) > 60 || strings.ContainsAny(name, "/\\") {
		name = "main"
	}
	if !h.allow(claims.UserID) {
		httpx.Error(w, http.StatusTooManyRequests, "too many runs; wait a minute and try again")
		return
	}

	result, err := h.runner.Run(r.Context(), req.Language, name, req.Code, req.Stdin)
	if err != nil {
		switch {
		case errors.Is(err, coderunner.ErrNotConfigured), errors.Is(err, coderunner.ErrUnavailable):
			httpx.Error(w, http.StatusServiceUnavailable, err.Error())
		default:
			httpx.Error(w, http.StatusBadGateway, err.Error())
		}
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}
