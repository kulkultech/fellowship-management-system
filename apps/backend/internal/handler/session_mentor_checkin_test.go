package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestMentorCheckIn(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	org, _ := orgRepo.Register(ctx, "checkin-org", "Check-in Org", "admin@checkin.test", "", model.OrgStatusApproved)
	admin, _ := userRepo.Create(ctx, "admin@checkin.test", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	mentor, _ := userRepo.Create(ctx, "mentor@checkin.test", "hash", "Mia Mentor", model.RoleMentor, &org.ID)
	other, _ := userRepo.Create(ctx, "other@checkin.test", "hash", "Not Assigned", model.RoleMentor, &org.ID)
	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "checkin", Name: "Check-in Program"})
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, mentor.ID, "Mentor", "")

	newSession := func(start time.Time) *model.ProgramSession {
		s, _ := sessionRepo.CreateSession(ctx, &model.ProgramSession{ProgramID: program.ID, Title: "S", StartTime: start, EndTime: start.Add(time.Hour)})
		return s
	}
	now := time.Now()
	onTime := newSession(now.Add(-5 * time.Minute))
	late := newSession(now.Add(-20 * time.Minute))
	soon := newSession(now.Add(2 * time.Hour))
	over := newSession(now.Add(-3 * time.Hour))
	adminMarked := newSession(now.Add(-2 * time.Minute))
	_ = sessionRepo.BatchUpdateMentorAttendance(ctx, adminMarked.ID, []model.MentorAttendance{{UserID: mentor.ID, Status: model.AttendanceStatusExcused}}, admin.ID)

	h := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)
	r := chi.NewRouter()
	r.Get("/sessions/{sessionId}/mentor-check-in", h.GetMentorCheckIn)
	r.Post("/sessions/{sessionId}/mentor-check-in", h.MentorCheckIn)
	do := func(u *model.User, method string, s *model.ProgramSession) (int, map[string]any) {
		req := httptest.NewRequest(method, "/sessions/"+s.ID.String()+"/mentor-check-in", nil)
		req = req.WithContext(middleware.WithUser(req.Context(), &auth.Claims{UserID: u.ID, Email: u.Email, Role: u.Role, OrganizationID: u.OrganizationID}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}

	if code, out := do(mentor, http.MethodPost, onTime); code != http.StatusOK || out["status"] != "present" {
		t.Fatalf("expected present, got %d %v", code, out)
	}
	if code, out := do(mentor, http.MethodPost, late); code != http.StatusOK || out["status"] != "late" {
		t.Fatalf("expected late, got %d %v", code, out)
	}
	if code, _ := do(mentor, http.MethodPost, soon); code != http.StatusBadRequest {
		t.Fatalf("expected 400 before check-in opens, got %d", code)
	}
	if code, _ := do(mentor, http.MethodPost, over); code != http.StatusBadRequest {
		t.Fatalf("expected 400 after the session finished, got %d", code)
	}
	if code, _ := do(other, http.MethodPost, onTime); code != http.StatusForbidden {
		t.Fatalf("expected 403 for a mentor not on this session, got %d", code)
	}
	// What an admin recorded is kept
	if code, out := do(mentor, http.MethodPost, adminMarked); code != http.StatusOK || out["status"] != "excused" || out["by_admin"] != true {
		t.Fatalf("expected the admin's excused status to be kept, got %d %v", code, out)
	}
	// Checking in again keeps the first time; GET reports it
	_, _ = do(mentor, http.MethodPost, onTime)
	if code, out := do(mentor, http.MethodGet, onTime); code != http.StatusOK || out["recorded"] != true || out["status"] != "present" || out["eligible"] != true {
		t.Fatalf("unexpected state %d %v", code, out)
	}
	if _, out := do(other, http.MethodGet, onTime); out["eligible"] != false {
		t.Fatalf("expected an unassigned mentor to be ineligible, got %v", out)
	}
}
