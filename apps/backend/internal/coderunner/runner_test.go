package coderunner

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func fakePiston(t *testing.T, gotBody *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/runtimes":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"language": "go", "version": "1.16.2"},
				{"language": "go", "version": "1.22.1"},
				{"language": "c++", "version": "10.2.0"},
			})
		case "/api/v2/execute":
			_ = json.NewDecoder(r.Body).Decode(gotBody)
			code := 0
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "go", "version": "1.22.1",
				"run": map[string]any{"stdout": "hello\n", "stderr": "", "code": code},
			})
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestRunner(t *testing.T) {
	var body map[string]any
	srv := fakePiston(t, &body)
	defer srv.Close()
	c := New(srv.URL + "/")

	langs, err := c.Available(context.Background())
	if err != nil || len(langs) != 2 || langs[0] != "cpp" || langs[1] != "go" {
		t.Fatalf("expected cpp and go to be available, got %v (%v)", langs, err)
	}

	res, err := c.Run(context.Background(), "go", "main.go", "package main", "")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if res.Run.Stdout != "hello\n" || res.Language != "go" {
		t.Fatalf("unexpected result %+v", res)
	}
	if body["language"] != "go" || body["version"] != "1.22.1" || body["run_timeout"] != float64(runTimeoutMs) {
		t.Fatalf("expected the newest installed version and limits, sent %v", body)
	}

	if _, err := c.Run(context.Background(), "rust", "main.rs", "fn main(){}", ""); err != ErrUnavailable {
		t.Fatalf("expected a not-installed language to be reported, got %v", err)
	}
	if _, err := c.Run(context.Background(), "cobol", "x", "", ""); err != ErrUnsupported {
		t.Fatalf("expected an unknown language to be refused, got %v", err)
	}
	if _, err := New("").Run(context.Background(), "go", "x", "", ""); err != ErrNotConfigured {
		t.Fatalf("expected not configured, got %v", err)
	}
}
