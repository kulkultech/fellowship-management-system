package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestSessionAndAttendance_Flow(t *testing.T) {
	ctx := context.Background()

	// 1. Repositories (in-memory mode for unit testing)
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	// 2. Setup Organization, Admin & Program
	org, err := orgRepo.Register(ctx, "kulkul-fellowship-org", "KulKul Fellowship Org", "admin@kulkul.tech", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	admin, err := userRepo.Create(ctx, "admin@kulkul.tech", "hash", "Admin Officer", model.RoleOrgAdmin, &org.ID)
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}

	mentorUser, err := userRepo.Create(ctx, "mentor@kulkul.tech", "hash", "Lead Mentor", model.RoleMentor, &org.ID)
	if err != nil {
		t.Fatalf("failed to create mentor: %v", err)
	}

	program, err := programRepo.Create(ctx, &model.Program{
		OrganizationID: org.ID,
		Slug:           "cloud-fellowship-2026",
		Name:           "Cloud Engineering Fellowship 2026",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// Assign mentor to program
	_, err = mentorRepo.AssignMentor(ctx, program.ID, mentorUser.ID, "Staff Architect", "Cloud expert")
	if err != nil {
		t.Fatalf("failed to assign mentor: %v", err)
	}

	// Create 2 accepted fellows
	fellow1, _, err := applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      program.ID,
		Email:          "fellow1@student.edu",
		FullName:       "Alice Fellow",
		CurrentStage:   model.StageApprovedForLive,
	})
	if err != nil {
		t.Fatalf("failed to create fellow1: %v", err)
	}

	fellow2, _, err := applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      program.ID,
		Email:          "fellow2@student.edu",
		FullName:       "Bob Fellow",
		CurrentStage:   model.StageApprovedForLive,
	})
	if err != nil {
		t.Fatalf("failed to create fellow2: %v", err)
	}

	// Handlers & Router setup
	sessionHandler := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)

	r := chi.NewRouter()
	r.Route("/api/v1/programs/{programId}/sessions", func(s chi.Router) {
		s.Get("/", sessionHandler.ListSessions)
		s.Post("/", sessionHandler.CreateSession)
		s.Get("/attendance-summary", sessionHandler.GetAttendanceSummary)
		s.Get("/{sessionId}", sessionHandler.GetSession)
		s.Put("/{sessionId}", sessionHandler.UpdateSession)
		s.Delete("/{sessionId}", sessionHandler.DeleteSession)
		s.Get("/{sessionId}/attendance", sessionHandler.GetSessionAttendance)
		s.Post("/{sessionId}/attendance", sessionHandler.BatchUpdateAttendance)
		s.Post("/{sessionId}/check-in", sessionHandler.FellowCheckIn)
	})

	var createdSessionID string

	// Test 1: Admin Creates Session
	t.Run("Admin creates fellowship session", func(t *testing.T) {
		start := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339)
		end := time.Now().Add(3 * time.Hour).UTC().Format(time.RFC3339)

		payload := map[string]any{
			"title":        "Orientation & Cloud Foundations",
			"description":  "Introduction to cohort expectations, mentorship, and AWS infra.",
			"session_type": "live_lecture",
			"start_time":   start,
			"end_time":     end,
			"meeting_url":  "https://meet.google.com/abc-defg-hij",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/programs/%s/sessions", program.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		claims := &auth.Claims{
			UserID:         admin.ID,
			Email:          admin.Email,
			Role:           admin.Role,
			OrganizationID: &org.ID,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
		}

		var res model.ProgramSession
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if res.Title != "Orientation & Cloud Foundations" {
			t.Errorf("expected title 'Orientation & Cloud Foundations', got '%s'", res.Title)
		}
		createdSessionID = res.ID.String()
	})

	// Test 2: Fellow Lists Sessions (gets their attendance status)
	t.Run("Fellow lists sessions with fellow attendance info", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/programs/%s/sessions", program.ID), nil)
		claims := &auth.Claims{
			UserID: uuid.New(),
			Email:  fellow1.Email,
			Role:   model.RoleCandidate,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res struct {
			Sessions []model.ProgramSession `json:"sessions"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode: %v", err)
		}
		if len(res.Sessions) != 1 {
			t.Fatalf("expected 1 session, got %d", len(res.Sessions))
		}
	})

	// Test 3: Fellow Self Check-In Requires Screenshot Proof
	t.Run("Fellow check-in rejected without screenshot proof", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/programs/%s/sessions/%s/check-in", program.ID, createdSessionID), nil)
		claims := &auth.Claims{
			UserID: uuid.New(),
			Email:  fellow1.Email,
			Role:   model.RoleCandidate,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when screenshot proof is missing, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("Fellow self checks in to session with screenshot proof", func(t *testing.T) {
		payload := map[string]any{
			"proof_image_url": "https://storage.kulkul.tech/attendance/proof-alice-meet.png",
			"notes":           "Joined via Google Meet on laptop",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/programs/%s/sessions/%s/check-in", program.ID, createdSessionID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		claims := &auth.Claims{
			UserID: uuid.New(),
			Email:  fellow1.Email,
			Role:   model.RoleCandidate,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res struct {
			Message    string                  `json:"message"`
			Attendance model.SessionAttendance `json:"attendance"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode: %v", err)
		}
		if res.Attendance.ApplicantID != fellow1.ID {
			t.Errorf("expected applicant_id %s, got %s", fellow1.ID, res.Attendance.ApplicantID)
		}
		if res.Attendance.Status != model.AttendanceStatusPresent {
			t.Errorf("expected status 'present', got '%s'", res.Attendance.Status)
		}
		if res.Attendance.ProofImageURL != "https://storage.kulkul.tech/attendance/proof-alice-meet.png" {
			t.Errorf("expected proof_image_url to match, got '%s'", res.Attendance.ProofImageURL)
		}
	})

	// Test 4: Mentor / Admin Views Attendance Check Sheet
	t.Run("Mentor retrieves session attendance list", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/programs/%s/sessions/%s/attendance", program.ID, createdSessionID), nil)
		claims := &auth.Claims{
			UserID:         mentorUser.ID,
			Email:          mentorUser.Email,
			Role:           model.RoleMentor,
			OrganizationID: &org.ID,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res struct {
			Attendance []model.SessionAttendance `json:"attendance"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode: %v", err)
		}
		if len(res.Attendance) != 2 {
			t.Fatalf("expected 2 fellows in attendance list, got %d", len(res.Attendance))
		}
	})

	// Test 5: Batch Attendance Update ("Mark All Present")
	t.Run("Admin marks all fellows present batch", func(t *testing.T) {
		payload := map[string]any{
			"attendances": []map[string]any{
				{"applicant_id": fellow1.ID, "status": "present", "notes": "On time active participation"},
				{"applicant_id": fellow2.ID, "status": "present", "notes": "Present via Google Meet"},
			},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/programs/%s/sessions/%s/attendance", program.ID, createdSessionID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		claims := &auth.Claims{
			UserID:         admin.ID,
			Email:          admin.Email,
			Role:           admin.Role,
			OrganizationID: &org.ID,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Test 6: Attendance Summary Analytics
	t.Run("Admin retrieves fellow attendance summary analytics", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/programs/%s/sessions/attendance-summary", program.ID), nil)
		claims := &auth.Claims{
			UserID:         admin.ID,
			Email:          admin.Email,
			Role:           admin.Role,
			OrganizationID: &org.ID,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res struct {
			Summaries []model.FellowAttendanceSummary `json:"summaries"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode: %v", err)
		}
		if len(res.Summaries) != 2 {
			t.Fatalf("expected 2 fellow summaries, got %d", len(res.Summaries))
		}
		// Since both are marked present for the 1 session, attendance rate should be 100% and status "Good"
		for _, s := range res.Summaries {
			if s.AttendanceRate != 100 {
				t.Errorf("expected attendance rate 100%%, got %d%% for %s", s.AttendanceRate, s.FullName)
			}
			if s.Status != "Good" {
				t.Errorf("expected status 'Good', got '%s' for %s", s.Status, s.FullName)
			}
		}
	})
}
