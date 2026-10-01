package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/holiday"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestSessionHolidayValidation(t *testing.T) {
	ctx := context.Background()

	// 1. Repositories
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	// 2. Setup Org & Admin
	org, err := orgRepo.Register(ctx, "acme-holidays", "Acme Holidays", "admin@acme.org", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	admin, err := userRepo.Create(ctx, "holiday_admin@kulkul.tech", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}

	program, err := programRepo.Create(ctx, &model.Program{
		OrganizationID: org.ID,
		Slug:           "indonesia-fellowship-2026",
		Name:           "Indonesia Fellowship 2026",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	sessionHandler := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)

	r := chi.NewRouter()
	r.Route("/api/v1/programs/{programId}/sessions", func(s chi.Router) {
		s.Post("/", sessionHandler.CreateSession)
		s.Put("/{sessionId}", sessionHandler.UpdateSession)
	})
	r.Get("/api/v1/holidays", sessionHandler.GetHolidays)

	adminClaims := &auth.Claims{
		UserID:         admin.ID,
		Email:          admin.Email,
		Role:           admin.Role,
		OrganizationID: &org.ID,
	}

	// Test 1: Scheduling on Indonesian Independence Day (17 August 2026) must fail
	t.Run("Cannot schedule session on 17 August 2026 (Hari Kemerdekaan RI)", func(t *testing.T) {
		start := time.Date(2026, 8, 17, 10, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)
		end := time.Date(2026, 8, 17, 12, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)

		payload := map[string]any{
			"title":        "Holiday Live Workshop",
			"session_type": "workshop",
			"start_time":   start,
			"end_time":     end,
			"meeting_url":  "https://meet.google.com/test-url",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/programs/%s/sessions", program.ID), bytes.NewReader(body))
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "cannot schedule session on Indonesian national holiday") {
			t.Fatalf("expected error message to mention Indonesian national holiday, got: %s", rec.Body.String())
		}
	})

	// Test 2: Scheduling on a regular business day (e.g. 15 October 2026) must succeed
	var normalSessionID uuid.UUID
	t.Run("Can schedule session on regular business day 15 October 2026", func(t *testing.T) {
		start := time.Date(2026, 10, 15, 19, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)
		end := time.Date(2026, 10, 15, 21, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)

		payload := map[string]any{
			"title":        "Standard Architecture Lecture",
			"session_type": "live_lecture",
			"start_time":   start,
			"end_time":     end,
			"meeting_url":  "https://meet.google.com/test-url",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/programs/%s/sessions", program.ID), bytes.NewReader(body))
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
		}

		var created model.ProgramSession
		_ = json.Unmarshal(rec.Body.Bytes(), &created)
		normalSessionID = created.ID
	})

	// Test 3: Updating session to Christmas (25 December 2026) must fail
	t.Run("Cannot update session to Christmas 25 December 2026", func(t *testing.T) {
		xmasStart := time.Date(2026, 12, 25, 10, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)
		xmasEnd := time.Date(2026, 12, 25, 12, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)

		payload := map[string]any{
			"start_time": xmasStart,
			"end_time":   xmasEnd,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/programs/%s/sessions/%s", program.ID, normalSessionID), bytes.NewReader(body))
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "cannot schedule session on Indonesian national holiday") {
			t.Fatalf("expected error message to mention Indonesian national holiday, got: %s", rec.Body.String())
		}
	})

	// Test 4: Querying holidays via GET /api/v1/holidays?year=2026
	t.Run("Query holidays for 2026", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/holidays?year=2026", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var list []holiday.Holiday
		if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
			t.Fatalf("failed to decode holidays: %v", err)
		}
		if len(list) < 15 {
			t.Fatalf("expected at least 15 holidays in 2026, got %d", len(list))
		}
	})

	// Test 5: Scheduling on Indonesian holiday when sync_indonesian_calendar = false must SUCCEED (International mode)
	t.Run("Can schedule on 17 August 2026 when sync_indonesian_calendar is false", func(t *testing.T) {
		start := time.Date(2026, 8, 17, 10, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)
		end := time.Date(2026, 8, 17, 12, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)
		syncFalse := false

		payload := map[string]any{
			"title":                    "Global Cohort Workshop",
			"session_type":             "workshop",
			"start_time":               start,
			"end_time":                 end,
			"meeting_url":              "https://meet.google.com/test-global",
			"sync_indonesian_calendar": syncFalse,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/programs/%s/sessions", program.ID), bytes.NewReader(body))
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for international mode, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Test 6: Updating session to holiday when sync_indonesian_calendar = false must SUCCEED (International mode)
	t.Run("Can update session to 25 December 2026 when sync_indonesian_calendar is false", func(t *testing.T) {
		xmasStart := time.Date(2026, 12, 25, 10, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)
		xmasEnd := time.Date(2026, 12, 25, 12, 0, 0, 0, holiday.WIBLocation).UTC().Format(time.RFC3339)
		syncFalse := false

		payload := map[string]any{
			"start_time":               xmasStart,
			"end_time":                 xmasEnd,
			"sync_indonesian_calendar": syncFalse,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/programs/%s/sessions/%s", program.ID, normalSessionID), bytes.NewReader(body))
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for international mode update, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

