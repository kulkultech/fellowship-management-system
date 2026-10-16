package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestRecurringSessions(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	org, _ := orgRepo.Register(ctx, "recur-org", "Recur Org", "admin@recur.test", "", model.OrgStatusApproved)
	admin, _ := userRepo.Create(ctx, "admin@recur.test", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "recur", Name: "Recur Program"})

	h := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, repository.NewMentorRepository(nil), userRepo)
	r := chi.NewRouter()
	r.Route("/programs/{programId}/sessions", func(s chi.Router) {
		s.Post("/", h.CreateSession)
		s.Post("/recurrence-preview", h.PreviewRecurrence)
		s.Put("/{sessionId}", h.UpdateSession)
		s.Delete("/{sessionId}", h.DeleteSession)
	})
	claims := &auth.Claims{UserID: admin.ID, Email: admin.Email, Role: admin.Role, OrganizationID: &org.ID}
	do := func(method, path string, body any) *httptest.ResponseRecorder {
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
	wib := time.FixedZone("WIB", 7*3600)
	// Monday 1 Feb 2027, 19:00-20:30 WIB (no holidays in the following weeks)
	start := time.Date(2027, 2, 1, 19, 0, 0, 0, wib)
	no := false

	listSeries := func() []model.ProgramSession {
		all, _ := sessionRepo.ListSessionsByProgram(ctx, program.ID, nil, nil)
		out := []model.ProgramSession{}
		for _, s := range all {
			if s.SeriesID != nil {
				out = append(out, s)
			}
		}
		sort.Slice(out, func(i, j int) bool { return out[i].StartTime.Before(out[j].StartTime) })
		return out
	}

	// Preview tells how many sessions will be made
	w := do(http.MethodPost, base+"recurrence-preview", map[string]any{
		"start_time": start.Format(time.RFC3339), "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO;COUNT=4", "time_zone": "Asia/Jakarta",
	})
	var preview struct {
		Count       int    `json:"count"`
		Description string `json:"description"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &preview)
	if w.Code != http.StatusOK || preview.Count != 4 || preview.Description != "Weekly on Monday, 4 times" {
		t.Fatalf("unexpected preview %d %s", w.Code, w.Body.String())
	}

	// Create a weekly series of 4
	w = do(http.MethodPost, base, map[string]any{
		"title": "Weekly Sync", "session_type": "group_sync",
		"start_time": start.Format(time.RFC3339), "end_time": start.Add(90 * time.Minute).Format(time.RFC3339),
		"recurrence_rule": "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4", "time_zone": "Asia/Jakarta",
		"send_calendar_invites": no, "sync_indonesian_calendar": no,
	})
	var created struct {
		ID                    string `json:"id"`
		SeriesID              string `json:"series_id"`
		RecurrenceDescription string `json:"recurrence_description"`
		OccurrencesCreated    int    `json:"occurrences_created"`
		GoogleCalendarLink    string `json:"google_calendar_html_link"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if w.Code != http.StatusCreated || created.OccurrencesCreated != 4 || created.SeriesID == "" || created.RecurrenceDescription != "Weekly on Monday, 4 times" {
		t.Fatalf("unexpected create %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(created.GoogleCalendarLink, "recur=RRULE") {
		t.Fatalf("expected a repeating Google Calendar link, got %s", created.GoogleCalendarLink)
	}
	sessions := listSeries()
	if len(sessions) != 4 || !sessions[3].StartTime.Equal(start.AddDate(0, 0, 21)) {
		t.Fatalf("expected 4 weekly sessions, got %d", len(sessions))
	}

	// "This event": only the 2nd session changes
	second := sessions[1]
	w = do(http.MethodPut, base+second.ID.String()+"?scope=this", map[string]any{
		"title": "Special Sync", "start_time": second.StartTime.Format(time.RFC3339), "end_time": second.EndTime.Format(time.RFC3339),
		"recurrence_rule": "FREQ=WEEKLY;BYDAY=MO;COUNT=4", "sync_indonesian_calendar": no,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if s := listSeries(); s[1].Title != "Special Sync" || s[0].Title != "Weekly Sync" || s[2].Title != "Weekly Sync" {
		t.Fatalf("expected only the 2nd title to change, got %q %q %q", s[0].Title, s[1].Title, s[2].Title)
	}

	// "All events" with the same rule: details and time change everywhere, dates stay
	first := sessions[0]
	later := first.StartTime.Add(time.Hour)
	w = do(http.MethodPut, base+first.ID.String()+"?scope=all", map[string]any{
		"title": "Weekly Sync v2", "start_time": later.Format(time.RFC3339), "end_time": later.Add(time.Hour).Format(time.RFC3339),
		"recurrence_rule": "FREQ=WEEKLY;BYDAY=MO;COUNT=4", "sync_indonesian_calendar": no,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	s := listSeries()
	if len(s) != 4 || s[3].Title != "Weekly Sync v2" || s[3].StartTime.In(wib).Hour() != 20 || s[3].EndTime.Sub(s[3].StartTime) != time.Hour {
		t.Fatalf("expected all sessions moved to 20:00 for 1h, got %+v", s[3])
	}

	// "This and following" from the 3rd with a new rule: Thursdays, 3 times; the first two stay
	third := s[2]
	thu := third.StartTime.AddDate(0, 0, 3)
	w = do(http.MethodPut, base+third.ID.String()+"?scope=following", map[string]any{
		"title": "Thursday Sync", "start_time": thu.Format(time.RFC3339), "end_time": thu.Add(time.Hour).Format(time.RFC3339),
		"recurrence_rule": "FREQ=WEEKLY;BYDAY=TH;COUNT=3", "sync_indonesian_calendar": no,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	s = listSeries()
	if len(s) != 5 {
		t.Fatalf("expected 2 Mondays + 3 Thursdays, got %d", len(s))
	}
	if s[0].SeriesID.String() == s[2].SeriesID.String() || s[2].StartTime.In(wib).Weekday() != time.Thursday || s[4].Title != "Thursday Sync" {
		t.Fatalf("expected the series to split at the 3rd session, got %+v", s)
	}
	if !strings.Contains(s[0].RecurrenceRule, "UNTIL=") {
		t.Fatalf("expected the first series to end before the split, got %s", s[0].RecurrenceRule)
	}

	// Delete "this and following" from the 2nd Thursday, then "all" of the Monday series
	w = do(http.MethodDelete, base+s[3].ID.String()+"?scope=following", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if n := len(listSeries()); n != 3 {
		t.Fatalf("expected 3 sessions left, got %d", n)
	}
	w = do(http.MethodDelete, base+s[0].ID.String()+"?scope=all", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if left := listSeries(); len(left) != 1 || left[0].Title != "Thursday Sync" {
		t.Fatalf("expected only the first Thursday to remain, got %+v", left)
	}

	// A single session can be turned into a repeating one
	single := time.Date(2027, 3, 3, 10, 0, 0, 0, wib)
	w = do(http.MethodPost, base, map[string]any{
		"title": "One-off", "start_time": single.Format(time.RFC3339), "end_time": single.Add(time.Hour).Format(time.RFC3339),
		"send_calendar_invites": no, "sync_indonesian_calendar": no,
	})
	var one struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &one)
	w = do(http.MethodPut, base+one.ID, map[string]any{
		"title": "Now Daily", "start_time": single.Format(time.RFC3339), "end_time": single.Add(time.Hour).Format(time.RFC3339),
		"recurrence_rule": "FREQ=DAILY;COUNT=3", "sync_indonesian_calendar": no,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if n := len(listSeries()); n != 4 {
		t.Fatalf("expected 1 Thursday + 3 daily sessions, got %d", n)
	}

	// Changing the repeat of a range that includes past sessions is refused (they keep their data)
	past := time.Now().Add(-48 * time.Hour).Truncate(time.Minute)
	w = do(http.MethodPost, base, map[string]any{
		"title": "Past Series", "start_time": past.Format(time.RFC3339), "end_time": past.Add(time.Hour).Format(time.RFC3339),
		"recurrence_rule": "FREQ=DAILY;COUNT=5", "send_calendar_invites": no, "sync_indonesian_calendar": no,
	})
	var pastSeries struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &pastSeries)
	w = do(http.MethodPut, base+pastSeries.ID+"?scope=all", map[string]any{
		"title": "Past Series", "start_time": past.Format(time.RFC3339), "end_time": past.Add(time.Hour).Format(time.RFC3339),
		"recurrence_rule": "FREQ=DAILY;COUNT=2", "sync_indonesian_calendar": no,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when past sessions are in range, got %d: %s", w.Code, w.Body.String())
	}
}
