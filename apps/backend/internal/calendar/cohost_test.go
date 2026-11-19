package calendar

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
)

// fakeMeetMembersAPI serves a space with one existing member and records the members created.
func fakeMeetMembersAPI(t *testing.T, created *[]map[string]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/spaces/abc-defg-hij":
			w.Write([]byte(`{"name":"spaces/jQCFfuBOdN5z","meetingCode":"abc-defg-hij"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/spaces/jQCFfuBOdN5z/members":
			w.Write([]byte(`{"members":[{"name":"spaces/jQCFfuBOdN5z/members/1","email":"Already@Example.com","role":"COHOST"}]}`))
		case r.Method == http.MethodPost && r.URL.Path == "/spaces/jQCFfuBOdN5z/members":
			var m map[string]string
			if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
				t.Errorf("decode: %v", err)
			}
			*created = append(*created, m)
			w.Write([]byte(`{}`))
		case r.Method == http.MethodPatch:
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			http.Error(w, `{"error":{"status":"NOT_FOUND"}}`, http.StatusNotFound)
		}
	}))
}

func TestSavingASessionAddsMentorsAsCoHosts(t *testing.T) {
	var created []map[string]string
	srv := fakeMeetMembersAPI(t, &created)
	defer srv.Close()

	client := func(context.Context) *http.Client { return srv.Client() }
	svc := &googleCalendarService{
		meetAPIBase:   srv.URL,
		meetClient:    client,
		membersClient: client,
		organizer:     "ragil@kulkul.tech",
		logger:        slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	_, err := svc.UpdateEvent(context.Background(), "google-event-1", CreateEventRequest{
		MeetingURL: "https://meet.google.com/abc-defg-hij",
		// the organizer, an existing member, a duplicate and a blank are all skipped
		CoHosts: []string{"mentor.a@example.com", "Ragil@kulkul.tech", "already@example.com", "MENTOR.A@example.com", " ", "mentor.b@gmail.com"},
	})
	if err != nil {
		t.Fatal(err)
	}

	var emails []string
	for _, m := range created {
		if m["role"] != "COHOST" {
			t.Errorf("member %v not created as co-host", m)
		}
		emails = append(emails, m["email"])
	}
	sort.Strings(emails)
	if got := strings.Join(emails, ","); got != "mentor.a@example.com,mentor.b@gmail.com" {
		t.Fatalf("co-hosts added = %s", got)
	}
}

func TestCoHostsSkippedWithoutMembersAccess(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/members") {
			calls++
		}
		w.Write([]byte(`{"name":"spaces/jQCFfuBOdN5z"}`))
	}))
	defer srv.Close()

	svc := &googleCalendarService{
		meetAPIBase: srv.URL,
		meetClient:  func(context.Context) *http.Client { return srv.Client() },
		logger:      slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	_, _ = svc.UpdateEvent(context.Background(), "google-event-1", CreateEventRequest{
		MeetingURL: "https://meet.google.com/abc-defg-hij",
		CoHosts:    []string{"mentor.a@example.com"},
	})
	if calls != 0 {
		t.Fatalf("members API called %d times without a members client", calls)
	}
}
