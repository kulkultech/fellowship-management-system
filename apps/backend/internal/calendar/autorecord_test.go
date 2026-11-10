package calendar

import (
	"context"
	"io"
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
