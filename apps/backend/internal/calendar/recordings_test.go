package calendar

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// fakeMeetRecordingsAPI serves two meetings in the same Meet room (a recurring session): an older one
// whose recording is still being processed and a newer one with a finished recording.
func fakeMeetRecordingsAPI(t *testing.T, gotFilter *string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/conferenceRecords":
			*gotFilter = r.URL.Query().Get("filter")
			_ = json.NewEncoder(w).Encode(map[string]any{"conferenceRecords": []map[string]any{
				{"name": "conferenceRecords/late", "startTime": "2026-11-13T03:10:00Z"},
				{"name": "conferenceRecords/early", "startTime": "2026-11-13T02:55:00Z"},
			}})
		case "/conferenceRecords/early/recordings":
			_ = json.NewEncoder(w).Encode(map[string]any{"recordings": []map[string]any{
				{"state": "ENDED"},
			}})
		case "/conferenceRecords/late/recordings":
			_ = json.NewEncoder(w).Encode(map[string]any{"recordings": []map[string]any{
				{"state": "FILE_GENERATED", "driveDestination": map[string]string{
					"file": "file123", "exportUri": "https://drive.google.com/file/d/file123/view",
				}},
			}})
		default:
			http.NotFound(w, r)
		}
	}))
}

func testRecordings(srv *httptest.Server) *Recordings {
	client := func(context.Context) *http.Client { return srv.Client() }
	return &Recordings{meetAPIBase: srv.URL, driveAPIBase: srv.URL, readClient: client, shareClient: client}
}

func TestFindRecording(t *testing.T) {
	var filter string
	srv := fakeMeetRecordingsAPI(t, &filter)
	defer srv.Close()

	start := time.Date(2026, 11, 13, 3, 0, 0, 0, time.UTC)
	rec, err := testRecordings(srv).FindRecording(context.Background(), "https://meet.google.com/tai-rgbk-gjv", start, start.Add(2*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if rec == nil || rec.URL != "https://drive.google.com/file/d/file123/view" || rec.FileID != "file123" {
		t.Fatalf("recording = %+v, want the finished one", rec)
	}
	want := `space.meeting_code = "tai-rgbk-gjv" AND start_time >= "2026-11-13T02:00:00.000Z" AND start_time <= "2026-11-13T05:00:00.000Z"`
	if filter != want {
		t.Fatalf("filter = %s\nwant     %s", filter, want)
	}
}

func TestFindRecordingNotReadyOrNotMeet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/conferenceRecords":
			_ = json.NewEncoder(w).Encode(map[string]any{"conferenceRecords": []map[string]any{
				{"name": "conferenceRecords/a", "startTime": "2026-11-13T03:00:00Z"},
			}})
		case "/conferenceRecords/a/recordings":
			_ = json.NewEncoder(w).Encode(map[string]any{"recordings": []map[string]any{{"state": "STARTED"}}})
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer srv.Close()
	r := testRecordings(srv)
	start := time.Date(2026, 11, 13, 3, 0, 0, 0, time.UTC)

	if rec, err := r.FindRecording(context.Background(), "https://meet.google.com/abc-defg-hij", start, start.Add(time.Hour)); err != nil || rec != nil {
		t.Fatalf("still recording: got %+v, %v; want nothing yet", rec, err)
	}
	if rec, err := r.FindRecording(context.Background(), "https://zoom.us/j/1", start, start.Add(time.Hour)); err != nil || rec != nil {
		t.Fatalf("zoom link: got %+v, %v; want nothing", rec, err)
	}
}

func TestFindRecordingReportsMissingScope(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"status":"PERMISSION_DENIED"}}`, http.StatusForbidden)
	}))
	defer srv.Close()
	start := time.Now()
	_, err := testRecordings(srv).FindRecording(context.Background(), "https://meet.google.com/abc-defg-hij", start, start)
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("err = %v, want the 403 reported", err)
	}
}

func TestShareRecording(t *testing.T) {
	var shared []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/files/file123/permissions" || r.URL.Query().Get("sendNotificationEmail") != "false" {
			t.Errorf("unexpected request %s?%s", r.URL.Path, r.URL.RawQuery)
		}
		var p struct{ Role, Type, EmailAddress string }
		_ = json.NewDecoder(r.Body).Decode(&p)
		if p.EmailAddress == "not-google@example.com" {
			http.Error(w, `{"error":{"message":"not a Google account"}}`, http.StatusBadRequest)
			return
		}
		if p.Role != "reader" || p.Type != "user" {
			t.Errorf("permission = %+v, want a reader user", p)
		}
		shared = append(shared, p.EmailAddress)
		w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	err := testRecordings(srv).ShareRecording(context.Background(), "file123", []string{"budi@gmail.com", "not-google@example.com", "sari@gmail.com"})
	if len(shared) != 2 || shared[0] != "budi@gmail.com" || shared[1] != "sari@gmail.com" {
		t.Fatalf("shared with %v, want the two Google accounts", shared)
	}
	if err == nil || !strings.Contains(err.Error(), "1 of 3") || !strings.Contains(err.Error(), "not-google@example.com") {
		t.Fatalf("err = %v, want the failed address reported", err)
	}

	off := testRecordings(srv)
	off.shareClient = nil
	if err := off.ShareRecording(context.Background(), "file123", []string{"x@gmail.com"}); err != nil || len(shared) != 2 {
		t.Fatalf("sharing off should do nothing, got %v", err)
	}
}
