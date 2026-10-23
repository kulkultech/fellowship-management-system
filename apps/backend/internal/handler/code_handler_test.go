package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/coderunner"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
)

func TestCodeRun(t *testing.T) {
	piston := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/runtimes" {
			_ = json.NewEncoder(w).Encode([]map[string]any{{"language": "python", "version": "3.12.0"}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"run": map[string]any{"stdout": "42\n", "code": 0}})
	}))
	defer piston.Close()

	h := handler.NewCodeHandler(coderunner.New(piston.URL))
	r := chi.NewRouter()
	r.Post("/code/run", h.Run)
	user := &auth.Claims{UserID: uuid.New(), Role: "candidate"}
	run := func(body any) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		_ = json.NewEncoder(&buf).Encode(body)
		req := httptest.NewRequest(http.MethodPost, "/code/run", &buf)
		req = req.WithContext(middleware.WithUser(req.Context(), user))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	if w := run(map[string]any{"language": "python", "file_name": "main.py", "code": "print(42)"}); w.Code != http.StatusOK || !bytes.Contains(w.Body.Bytes(), []byte(`"stdout":"42\n"`)) {
		t.Fatalf("expected a successful run, got %d %s", w.Code, w.Body.String())
	}
	if w := run(map[string]any{"language": "cobol", "code": "x"}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an unknown language, got %d", w.Code)
	}
	if w := run(map[string]any{"language": "go", "code": "package main"}); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for a language that is not installed, got %d", w.Code)
	}
	if w := run(map[string]any{"language": "python", "code": string(make([]byte, coderunner.MaxCodeBytes+1))}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a file that is too large, got %d", w.Code)
	}
	// 2 runs so far count towards the limit; keep going until it trips
	limited := false
	for i := 0; i < 25; i++ {
		if w := run(map[string]any{"language": "python", "code": "print(1)"}); w.Code == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Fatalf("expected the per-user rate limit to apply")
	}
}
