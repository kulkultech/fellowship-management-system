package calendar

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeMeetAPI behaves like the Meet API: a meeting code is accepted as an alias when reading a
// space, but an update must use the space's own name.
func fakeMeetAPI(t *testing.T, patched *string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/spaces/abc-defg-hij":
			w.Write([]byte(`{"name":"spaces/jQCFfuBOdN5z","meetingCode":"abc-defg-hij"}`))
		case r.Method == http.MethodPatch && r.URL.Path == "/spaces/jQCFfuBOdN5z":
			if mask := r.URL.Query().Get("updateMask"); mask != "config.artifactConfig.recordingConfig.autoRecordingGeneration" {
				t.Errorf("updateMask = %q", mask)
			}
			b, _ := io.ReadAll(r.Body)
			*patched = string(b)
			w.Write([]byte(`{}`))
		default:
			http.Error(w, `{"error":{"status":"NOT_FOUND"}}`, http.StatusNotFound)
		}
	}))
}

func TestEnableAutoRecordingPatchesSpaceByItsName(t *testing.T) {
	var patched string
	srv := fakeMeetAPI(t, &patched)
	defer srv.Close()

	svc := &googleCalendarService{meetAPIBase: srv.URL}
	if err := svc.enableAutoRecording(context.Background(), srv.Client(), "abc-defg-hij"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(patched, `"autoRecordingGeneration":"ON"`) {
		t.Fatalf("patch body = %q", patched)
	}
}

func TestEnableAutoRecordingReportsAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"status":"PERMISSION_DENIED"}}`, http.StatusForbidden)
	}))
	defer srv.Close()

	svc := &googleCalendarService{meetAPIBase: srv.URL}
	err := svc.enableAutoRecording(context.Background(), srv.Client(), "abc-defg-hij")
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("err = %v, want 403 error", err)
	}
}

func TestEnableAutoRecordingRejectsUnexpectedSpaceName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{"name":"conferenceRecords/x/recordings/y"}`))
	}))
	defer srv.Close()

	svc := &googleCalendarService{meetAPIBase: srv.URL}
	if err := svc.enableAutoRecording(context.Background(), srv.Client(), "abc-defg-hij"); err == nil {
		t.Fatal("want error for a name that isn't spaces/{id}")
	}
}

func TestMeetingCodeFromURL(t *testing.T) {
	cases := map[string]string{
		"https://meet.google.com/abc-defg-hij":          "abc-defg-hij",
		" https://meet.google.com/abc-defg-hij/ ":       "abc-defg-hij",
		"https://meet.google.com/abc-defg-hij?authuser": "abc-defg-hij",
		"https://meet.google.com":                       "",
		"https://meet.google.com/lookup/xyz":            "",
		"https://zoom.us/j/123456789":                   "",
		"":                                              "",
	}
	for in, want := range cases {
		if got := meetingCodeFromURL(in); got != want {
			t.Errorf("meetingCodeFromURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUpdateEventTurnsOnAutoRecording(t *testing.T) {
	var patched string
	srv := fakeMeetAPI(t, &patched)
	defer srv.Close()

	svc := &googleCalendarService{
		meetAPIBase: srv.URL,
		meetClient:  func(context.Context) *http.Client { return srv.Client() },
		logger:      slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	if _, err := svc.UpdateEvent(context.Background(), "google-event-1", CreateEventRequest{MeetingURL: "https://meet.google.com/abc-defg-hij"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(patched, `"autoRecordingGeneration":"ON"`) {
		t.Fatalf("saving a session with a Meet room should turn on auto-recording, patch body = %q", patched)
	}
}

func TestUpdateEventLeavesOtherMeetingsAlone(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++ }))
	defer srv.Close()

	svc := &googleCalendarService{
		meetAPIBase: srv.URL,
		meetClient:  func(context.Context) *http.Client { return srv.Client() },
		logger:      slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	ctx := context.Background()
	_, _ = svc.UpdateEvent(ctx, "google-event-1", CreateEventRequest{MeetingURL: "https://zoom.us/j/123456789"})
	_, _ = svc.UpdateEvent(ctx, "fms-local-1", CreateEventRequest{MeetingURL: "https://meet.google.com/abc-defg-hij"})
	if calls != 0 {
		t.Fatalf("expected no Meet API calls for a Zoom link or a local-only event, got %d", calls)
	}

	svc.meetClient = nil
	_, _ = svc.UpdateEvent(ctx, "google-event-1", CreateEventRequest{MeetingURL: "https://meet.google.com/abc-defg-hij"})
	if calls != 0 {
		t.Fatalf("expected no Meet API calls with auto-recording off, got %d", calls)
	}
}
