package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kulkul/backend/internal/handler"
)

type mockPinger struct {
	err error
}

func (m *mockPinger) Ping(_ context.Context) error {
	return m.err
}

func TestHealthHandler_Liveness(t *testing.T) {
	h := handler.NewHealthHandler(&mockPinger{}, "test")

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	h.Liveness(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if res["status"] != "ok" {
		t.Errorf("expected status 'ok', got %q", res["status"])
	}
}

func TestHealthHandler_Readiness_Success(t *testing.T) {
	h := handler.NewHealthHandler(&mockPinger{err: nil}, "test")

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	h.Readiness(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res struct {
		Status string                            `json:"status"`
		Checks map[string]handler.ComponentStatus `json:"checks"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res.Status != "ready" {
		t.Errorf("expected status 'ready', got %q", res.Status)
	}
	if dbCheck, ok := res.Checks["database"]; !ok || dbCheck.Status != "up" {
		t.Errorf("expected database check to be 'up', got %+v", dbCheck)
	}
}

func TestHealthHandler_Readiness_Failure(t *testing.T) {
	h := handler.NewHealthHandler(&mockPinger{err: errors.New("db connection timeout")}, "production")

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	h.Readiness(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}

	var res struct {
		Status string                            `json:"status"`
		Checks map[string]handler.ComponentStatus `json:"checks"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res.Status != "not_ready" {
		t.Errorf("expected status 'not_ready', got %q", res.Status)
	}
	if dbCheck, ok := res.Checks["database"]; !ok || dbCheck.Status != "down" {
		t.Errorf("expected database check to be 'down', got %+v", dbCheck)
	}
}

func TestHealthHandler_Readiness_NilDB(t *testing.T) {
	h := handler.NewHealthHandler(nil, "development")

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	h.Readiness(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}
}

func TestHealthHandler_Health_Detailed(t *testing.T) {
	h := handler.NewHealthHandler(&mockPinger{err: nil}, "production")

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	h.Health(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res handler.HealthResponse
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res.Status != "ok" {
		t.Errorf("expected status 'ok', got %q", res.Status)
	}
	if res.Environment != "production" {
		t.Errorf("expected environment 'production', got %q", res.Environment)
	}
	if res.Timestamp == "" {
		t.Error("expected non-empty timestamp")
	}
	if res.Uptime == "" {
		t.Error("expected non-empty uptime")
	}
	if dbCheck, ok := res.Checks["database"]; !ok || dbCheck.Status != "up" {
		t.Errorf("expected database check to be 'up', got %+v", dbCheck)
	}
}

func TestHealthz_Standalone(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	handler.Healthz(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
}
