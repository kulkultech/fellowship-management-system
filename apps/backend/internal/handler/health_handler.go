package handler

import (
	"context"
	"net/http"
	"reflect"
	"time"

	"github.com/kulkul/backend/internal/httpx"
)

// DatabasePinger defines the interface required for checking database connectivity.
// It is implemented by *pgxpool.Pool.
type DatabasePinger interface {
	Ping(ctx context.Context) error
}

type HealthHandler struct {
	db        DatabasePinger
	appEnv    string
	startTime time.Time
}

func isNilPinger(p DatabasePinger) bool {
	if p == nil {
		return true
	}
	val := reflect.ValueOf(p)
	if val.Kind() == reflect.Pointer || val.Kind() == reflect.Interface {
		return val.IsNil()
	}
	return false
}

func NewHealthHandler(db DatabasePinger, appEnv string) *HealthHandler {
	var pinger DatabasePinger
	if !isNilPinger(db) {
		pinger = db
	}
	return &HealthHandler{
		db:        pinger,
		appEnv:    appEnv,
		startTime: time.Now(),
	}
}

type ComponentStatus struct {
	Status    string  `json:"status"`
	LatencyMS float64 `json:"latency_ms,omitempty"`
	Error     string  `json:"error,omitempty"`
}

type HealthResponse struct {
	Status      string                     `json:"status"`
	Environment string                     `json:"environment,omitempty"`
	Uptime      string                     `json:"uptime,omitempty"`
	Timestamp   string                     `json:"timestamp"`
	Checks      map[string]ComponentStatus `json:"checks,omitempty"`
}

type SimpleStatusResponse struct {
	Status string `json:"status"`
}

// Liveness returns a 200 OK status to indicate that the HTTP server process is running.
// Suitable for Kubernetes liveness probes.
func (h *HealthHandler) Liveness(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, SimpleStatusResponse{Status: "ok"})
}

// Readiness checks whether backend dependencies (such as the database) are healthy.
// Suitable for Kubernetes readiness probes.
func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {
	checks := make(map[string]ComponentStatus)
	isReady := true

	if isNilPinger(h.db) {
		isReady = false
		checks["database"] = ComponentStatus{
			Status: "down",
			Error:  "database not configured or unavailable",
		}
	} else {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		start := time.Now()
		if err := h.db.Ping(ctx); err != nil {
			isReady = false
			checks["database"] = ComponentStatus{
				Status:    "down",
				LatencyMS: float64(time.Since(start).Microseconds()) / 1000.0,
				Error:     err.Error(),
			}
		} else {
			checks["database"] = ComponentStatus{
				Status:    "up",
				LatencyMS: float64(time.Since(start).Microseconds()) / 1000.0,
			}
		}
	}

	statusCode := http.StatusOK
	statusText := "ready"
	if !isReady {
		statusCode = http.StatusServiceUnavailable
		statusText = "not_ready"
	}

	httpx.JSON(w, statusCode, map[string]any{
		"status": statusText,
		"checks": checks,
	})
}

// Health provides an aggregated health overview with diagnostics for monitoring and dashboards.
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	checks := make(map[string]ComponentStatus)
	isHealthy := true

	if isNilPinger(h.db) {
		// In dev/test, db might be nil if not configured yet
		isHealthy = false
		checks["database"] = ComponentStatus{
			Status: "down",
			Error:  "database not configured or unavailable",
		}
	} else {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		start := time.Now()
		if err := h.db.Ping(ctx); err != nil {
			isHealthy = false
			checks["database"] = ComponentStatus{
				Status:    "down",
				LatencyMS: float64(time.Since(start).Microseconds()) / 1000.0,
				Error:     err.Error(),
			}
		} else {
			checks["database"] = ComponentStatus{
				Status:    "up",
				LatencyMS: float64(time.Since(start).Microseconds()) / 1000.0,
			}
		}
	}

	overallStatus := "ok"
	statusCode := http.StatusOK
	if !isHealthy {
		overallStatus = "unhealthy"
		statusCode = http.StatusServiceUnavailable
	}

	res := HealthResponse{
		Status:      overallStatus,
		Environment: h.appEnv,
		Uptime:      time.Since(h.startTime).Truncate(time.Second).String(),
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Checks:      checks,
	}

	httpx.JSON(w, statusCode, res)
}

// Healthz is a backward-compatible standalone handler.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, SimpleStatusResponse{Status: "ok"})
}
