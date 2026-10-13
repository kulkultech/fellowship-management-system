package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
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

func TestMentorAttendance(t *testing.T) {
	ctx := context.Background()

	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	org, _ := orgRepo.Register(ctx, "mentor-att-org", "Mentor Att Org", "admin@org.test", "", model.OrgStatusApproved)
	otherOrg, _ := orgRepo.Register(ctx, "other-org", "Other Org", "admin@other.test", "", model.OrgStatusApproved)

	admin, _ := userRepo.Create(ctx, "admin@org.test", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	otherAdmin, _ := userRepo.Create(ctx, "admin@other.test", "hash", "Other Admin", model.RoleOrgAdmin, &otherOrg.ID)
	mentorA, _ := userRepo.Create(ctx, "a@org.test", "hash", "Ana Mentor", model.RoleMentor, &org.ID)
	mentorB, _ := userRepo.Create(ctx, "b@org.test", "hash", "Budi Mentor", model.RoleMentor, &org.ID)
	guestLead, _ := userRepo.Create(ctx, "guest@org.test", "hash", "Guest Lead", model.RoleMentor, &org.ID)
	outsider, _ := userRepo.Create(ctx, "x@org.test", "hash", "Not A Mentor", model.RoleMentor, &org.ID)

	program, err := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "mentor-att", Name: "Mentor Att Program"})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, mentorA.ID, "Staff Engineer", "")
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, mentorB.ID, "Mentor", "")

	newSession := func(title string, start time.Time, lead *uuid.UUID) *model.ProgramSession {
		s, err := sessionRepo.CreateSession(ctx, &model.ProgramSession{
			ProgramID: program.ID,
			Title:     title,
			StartTime: start,
			EndTime:   start.Add(time.Hour),
			MentorID:  lead,
		})
		if err != nil {
			t.Fatalf("failed to create session: %v", err)
		}
		return s
	}
	past1 := newSession("Past 1", time.Now().Add(-48*time.Hour), &mentorA.ID)
	past2 := newSession("Past 2", time.Now().Add(-24*time.Hour), &guestLead.ID)
	_ = newSession("Future", time.Now().Add(48*time.Hour), &mentorA.ID)

	sessionHandler := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)
	r := chi.NewRouter()
	r.Route("/programs/{programId}/sessions", func(s chi.Router) {
		s.Get("/mentor-attendance-summary", sessionHandler.GetMentorAttendanceSummary)
		s.Get("/{sessionId}/mentor-attendance", sessionHandler.GetMentorAttendance)
		s.Post("/{sessionId}/mentor-attendance", sessionHandler.BatchUpdateMentorAttendance)
	})

	claimsFor := func(u *model.User) *auth.Claims {
		return &auth.Claims{UserID: u.ID, Email: u.Email, Role: u.Role, OrganizationID: u.OrganizationID}
	}
	do := func(claims *auth.Claims, method, path string, body any) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	base := "/programs/" + program.ID.String() + "/sessions/"

	// Roster for a session lists assigned mentors plus that session's guest lead
	w := do(claimsFor(admin), http.MethodGet, base+past2.ID.String()+"/mentor-attendance", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var roster struct {
		Attendance []model.MentorAttendance `json:"attendance"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &roster)
	if len(roster.Attendance) != 3 {
		t.Fatalf("expected 3 mentors on roster, got %d", len(roster.Attendance))
	}
	for _, m := range roster.Attendance {
		if m.Recorded || m.Status != model.AttendanceStatusAbsent {
			t.Fatalf("expected unrecorded default status, got %+v", m)
		}
		if m.UserID == guestLead.ID && !m.IsLead {
			t.Fatalf("expected guest lead to be flagged as lead")
		}
	}

	// Save attendance
	save := func(sessionID uuid.UUID, entries []map[string]string) *httptest.ResponseRecorder {
		return do(claimsFor(admin), http.MethodPost, base+sessionID.String()+"/mentor-attendance", map[string]any{"attendances": entries})
	}
	if w := save(past1.ID, []map[string]string{
		{"user_id": mentorA.ID.String(), "status": "present"},
		{"user_id": mentorB.ID.String(), "status": "late"},
	}); w.Code != http.StatusOK {
		t.Fatalf("expected 200 saving attendance, got %d: %s", w.Code, w.Body.String())
	}
	if w := save(past2.ID, []map[string]string{
		{"user_id": mentorA.ID.String(), "status": "excused", "notes": "sick"},
		{"user_id": mentorB.ID.String(), "status": "absent"},
		{"user_id": guestLead.ID.String(), "status": "present"},
	}); w.Code != http.StatusOK {
		t.Fatalf("expected 200 saving attendance, got %d: %s", w.Code, w.Body.String())
	}

	// Saved values come back on the roster
	w = do(claimsFor(admin), http.MethodGet, base+past1.ID.String()+"/mentor-attendance", nil)
	_ = json.Unmarshal(w.Body.Bytes(), &roster)
	for _, m := range roster.Attendance {
		if m.UserID == mentorA.ID && (m.Status != model.AttendanceStatusPresent || !m.Recorded || !m.IsLead) {
			t.Fatalf("expected Ana present, recorded, and lead: %+v", m)
		}
	}

	// Invalid status and non-mentor users are rejected
	if w := save(past1.ID, []map[string]string{{"user_id": mentorA.ID.String(), "status": "pending_validation"}}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid status, got %d", w.Code)
	}
	if w := save(past1.ID, []map[string]string{{"user_id": outsider.ID.String(), "status": "present"}}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-mentor, got %d", w.Code)
	}

	// Summary counts only sessions that have started
	w = do(claimsFor(admin), http.MethodGet, base+"mentor-attendance-summary", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var summary struct {
		Summaries []model.MentorAttendanceSummary `json:"summaries"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &summary)
	byID := map[uuid.UUID]model.MentorAttendanceSummary{}
	for _, s := range summary.Summaries {
		byID[s.UserID] = s
	}
	ana := byID[mentorA.ID]
	if ana.TotalSessions != 2 || ana.LedCount != 1 || ana.PresentCount != 1 || ana.ExcusedCount != 1 || ana.AttendanceRate != 50 {
		t.Fatalf("unexpected summary for Ana: %+v", ana)
	}
	budi := byID[mentorB.ID]
	if budi.LateCount != 1 || budi.AbsentCount != 1 || budi.AttendanceRate != 50 || budi.Status != "At Risk" {
		t.Fatalf("unexpected summary for Budi: %+v", budi)
	}
	if guest := byID[guestLead.ID]; guest.LedCount != 1 || guest.PresentCount != 1 {
		t.Fatalf("unexpected summary for guest lead: %+v", guest)
	}

	// Mentors themselves and admins of other organizations cannot manage mentor attendance
	if w := do(claimsFor(mentorA), http.MethodGet, base+"mentor-attendance-summary", nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for mentor, got %d", w.Code)
	}
	if w := do(claimsFor(otherAdmin), http.MethodGet, base+past1.ID.String()+"/mentor-attendance", nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for other org admin, got %d", w.Code)
	}
}
