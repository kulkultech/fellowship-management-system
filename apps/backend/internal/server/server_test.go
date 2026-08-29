package server_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/server"
)

func TestServer_HealthEndpoints(t *testing.T) {
	cfg := &config.Config{
		AppEnv:             "test",
		HTTPPort:           "8080",
		JWTSecret:          "0123456789abcdef0123456789abcdef",
		JWTTTL:             15 * time.Minute,
		CORSAllowedOrigins: []string{"http://localhost:3000"},
	}
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	srv := server.New(cfg, nil, logger)

	testCases := []struct {
		name           string
		path           string
		expectedStatus int
	}{
		{name: "root healthz", path: "/healthz", expectedStatus: http.StatusOK},
		{name: "root livez", path: "/livez", expectedStatus: http.StatusOK},
		{name: "api v1 health live", path: "/api/v1/health/live", expectedStatus: http.StatusOK},
		{name: "api v1 health liveness", path: "/api/v1/health/liveness", expectedStatus: http.StatusOK},
		{name: "root readyz without db", path: "/readyz", expectedStatus: http.StatusServiceUnavailable},
		{name: "api v1 health ready without db", path: "/api/v1/health/ready", expectedStatus: http.StatusServiceUnavailable},
		{name: "root health without db", path: "/health", expectedStatus: http.StatusServiceUnavailable},
		{name: "api v1 health without db", path: "/api/v1/health", expectedStatus: http.StatusServiceUnavailable},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			rec := httptest.NewRecorder()

			srv.ServeHTTP(rec, req)

			if rec.Code != tc.expectedStatus {
				t.Errorf("path %q: expected status %d, got %d (body: %s)", tc.path, tc.expectedStatus, rec.Code, rec.Body.String())
			}

			var body map[string]any
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatalf("path %q: failed to decode JSON response: %v", tc.path, err)
			}
			if _, ok := body["status"]; !ok {
				t.Errorf("path %q: expected 'status' key in response, got %+v", tc.path, body)
			}
		})
	}
}
