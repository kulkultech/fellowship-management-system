package calendar

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEnableAutoRecordingPatchesSpace(t *testing.T) {
	var gotMethod, gotPath, gotMask, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotMask = r.Method, r.URL.Path, r.URL.Query().Get("updateMask")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	svc := &googleCalendarService{meetAPIBase: srv.URL}
	if err := svc.enableAutoRecording(context.Background(), srv.Client(), "abc-defg-hij"); err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodPatch || gotPath != "/spaces/abc-defg-hij" {
		t.Fatalf("request = %s %s", gotMethod, gotPath)
	}
	if gotMask != "config.artifactConfig.recordingConfig.autoRecordingGeneration" {
		t.Fatalf("updateMask = %q", gotMask)
	}
	if !strings.Contains(gotBody, `"autoRecordingGeneration":"ON"`) {
		t.Fatalf("body = %s", gotBody)
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
