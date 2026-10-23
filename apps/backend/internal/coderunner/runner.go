// Package coderunner runs workspace code files on a Piston code runner
// (https://github.com/engineer-man/piston), which sandboxes each run with time and memory limits
// and no network access.
package coderunner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// Languages maps the workspace's language ids to Piston language names. Only these can be run.
var Languages = map[string]string{
	"python":     "python",
	"javascript": "javascript",
	"typescript": "typescript",
	"java":       "java",
	"go":         "go",
	"rust":       "rust",
	"c":          "c",
	"cpp":        "c++",
	"csharp":     "csharp",
	"kotlin":     "kotlin",
	"swift":      "swift",
	"ruby":       "ruby",
	"php":        "php",
	"bash":       "bash",
	"sql":        "sqlite3",
	"lua":        "lua",
	"r":          "rscript",
	"scala":      "scala",
	"dart":       "dart",
	"haskell":    "haskell",
	"elixir":     "elixir",
	"perl":       "perl",
}

const (
	MaxCodeBytes   = 64 * 1024
	MaxStdinBytes  = 8 * 1024
	MaxOutputBytes = 64 * 1024
	// These must not exceed the runner's configured limits (kulkul-infra apps/code-runner), or
	// Piston refuses the run
	runTimeoutMs       = 5000
	buildTimeoutMs     = 15000
	runMemoryLimit     = 256 * 1024 * 1024 // bytes
	compileMemoryLimit = 512 * 1024 * 1024 // bytes; Kotlin and Scala compilers need more than 256 MB
)

var (
	ErrNotConfigured = errors.New("the code runner is not set up")
	ErrUnsupported   = errors.New("this language cannot be run")
	ErrUnavailable   = errors.New("this language is not installed on the code runner yet")
)

// Stage is the output of compiling or running.
type Stage struct {
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
	Code   *int   `json:"code"`
	Signal string `json:"signal,omitempty"`
}

// Result is the outcome of one run.
type Result struct {
	Language string `json:"language"`
	Version  string `json:"version"`
	Compile  *Stage `json:"compile,omitempty"`
	Run      Stage  `json:"run"`
}

type runtime struct {
	Language string   `json:"language"`
	Version  string   `json:"version"`
	Aliases  []string `json:"aliases"`
}

// Client talks to a Piston instance.
type Client struct {
	baseURL string
	http    *http.Client

	mu        sync.Mutex
	versions  map[string]string // Piston language -> installed version
	fetchedAt time.Time
}

func New(baseURL string) *Client {
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), http: &http.Client{Timeout: 40 * time.Second}}
}

func (c *Client) Configured() bool { return c != nil && c.baseURL != "" }

// installed returns the installed version of each Piston language (cached for a few minutes).
func (c *Client) installed(ctx context.Context) (map[string]string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.versions != nil && time.Since(c.fetchedAt) < 5*time.Minute {
		return c.versions, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v2/runtimes", nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("code runner unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("code runner returned %d", resp.StatusCode)
	}
	var list []runtime
	if err := json.NewDecoder(resp.Body).Decode(&list); err != nil {
		return nil, err
	}
	versions := map[string]string{}
	for _, rt := range list {
		if cur, ok := versions[rt.Language]; !ok || newerVersion(rt.Version, cur) {
			versions[rt.Language] = rt.Version
		}
	}
	c.versions, c.fetchedAt = versions, time.Now()
	return versions, nil
}

// Available lists the workspace language ids that can be run right now.
func (c *Client) Available(ctx context.Context) ([]string, error) {
	if !c.Configured() {
		return []string{}, nil
	}
	versions, err := c.installed(ctx)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for id, lang := range Languages {
		if _, ok := versions[lang]; ok {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out, nil
}

// Run compiles (when needed) and runs one file.
func (c *Client) Run(ctx context.Context, languageID, fileName, code, stdin string) (*Result, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	lang, ok := Languages[languageID]
	if !ok {
		return nil, ErrUnsupported
	}
	versions, err := c.installed(ctx)
	if err != nil {
		return nil, err
	}
	version, ok := versions[lang]
	if !ok {
		return nil, ErrUnavailable
	}
	body, _ := json.Marshal(map[string]any{
		"language":             lang,
		"version":              version,
		"files":                []map[string]string{{"name": fileName, "content": code}},
		"stdin":                stdin,
		"run_timeout":          runTimeoutMs,
		"compile_timeout":      buildTimeoutMs,
		"run_memory_limit":     runMemoryLimit,
		"compile_memory_limit": compileMemoryLimit,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v2/execute", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("code runner unreachable: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4*MaxOutputBytes))
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &e)
		if e.Message == "" {
			e.Message = fmt.Sprintf("code runner returned %d", resp.StatusCode)
		}
		return nil, errors.New(e.Message)
	}
	var out Result
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("unexpected code runner reply: %w", err)
	}
	out.Language = languageID
	trim := func(s *Stage) {
		s.Stdout = truncate(s.Stdout)
		s.Stderr = truncate(s.Stderr)
	}
	trim(&out.Run)
	if out.Compile != nil {
		trim(out.Compile)
	}
	return &out, nil
}

func truncate(s string) string {
	if len(s) <= MaxOutputBytes {
		return s
	}
	return s[:MaxOutputBytes] + "\n… output truncated"
}

// newerVersion compares dotted versions numerically (e.g. 3.12.0 > 3.9.4).
func newerVersion(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			fmt.Sscanf(pa[i], "%d", &x)
		}
		if i < len(pb) {
			fmt.Sscanf(pb[i], "%d", &y)
		}
		if x != y {
			return x > y
		}
	}
	return false
}
