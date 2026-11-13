package handler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/calendar"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type fakeRecordingFinder struct {
	recordings map[string]*calendar.Recording // meeting URL → recording
	failFor    string
	sharing    bool
	asked      []string
	shared     map[string][]string // file ID → emails
}

func (f *fakeRecordingFinder) FindRecording(_ context.Context, meetingURL string, _, _ time.Time) (*calendar.Recording, error) {
	f.asked = append(f.asked, meetingURL)
	if meetingURL == f.failFor {
		return nil, errors.New("google api error 403")
	}
	return f.recordings[meetingURL], nil
}

func (f *fakeRecordingFinder) SharingEnabled() bool { return f.sharing }

func (f *fakeRecordingFinder) ShareRecording(_ context.Context, fileID string, emails []string) error {
	if f.shared == nil {
		f.shared = map[string][]string{}
	}
	f.shared[fileID] = emails
	return nil
}

func TestRecordingSync(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewSessionRepository(nil, nil)
	now := time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC)
	add := func(meetingURL, recordingURL string, endedAgo time.Duration) uuid.UUID {
		end := now.Add(-endedAgo)
		s, err := repo.CreateSession(ctx, &model.ProgramSession{
			ProgramID: uuid.New(), Title: meetingURL, MeetingURL: meetingURL, RecordingURL: recordingURL,
			StartTime: end.Add(-2 * time.Hour), EndTime: end, TargetApplicantIDs: []uuid.UUID{uuid.New()},
		})
		if err != nil {
			t.Fatal(err)
		}
		return s.ID
	}
	ready := add("https://meet.google.com/aaa-aaaa-aaa", "", 2*time.Hour)
	processing := add("https://meet.google.com/bbb-bbbb-bbb", "", time.Hour)
	failing := add("https://meet.google.com/ccc-cccc-ccc", "", time.Hour)
	manual := add("https://meet.google.com/ddd-dddd-ddd", "https://youtu.be/manual", time.Hour)
	zoom := add("https://zoom.us/j/1", "", time.Hour)
	justEnded := add("https://meet.google.com/eee-eeee-eee", "", time.Minute)
	old := add("https://meet.google.com/fff-ffff-fff", "", 5*24*time.Hour)

	finder := &fakeRecordingFinder{
		recordings: map[string]*calendar.Recording{
			"https://meet.google.com/aaa-aaaa-aaa": {URL: "https://drive.google.com/file/d/f1/view", FileID: "f1"},
			"https://meet.google.com/ddd-dddd-ddd": {URL: "https://drive.google.com/file/d/f4/view", FileID: "f4"},
		},
		failFor: "https://meet.google.com/ccc-cccc-ccc",
		sharing: true,
	}
	NewRecordingSync(repo, finder, slog.New(slog.NewTextHandler(io.Discard, nil))).RunOnce(ctx, now)

	recordingOf := func(id uuid.UUID) string {
		s, err := repo.GetSessionByID(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return s.RecordingURL
	}
	if got := recordingOf(ready); got != "https://drive.google.com/file/d/f1/view" {
		t.Errorf("ready session recording = %q, want the Drive link", got)
	}
	if got := recordingOf(manual); got != "https://youtu.be/manual" {
		t.Errorf("a typed-in recording link was replaced with %q", got)
	}
	for name, id := range map[string]uuid.UUID{"processing": processing, "failing": failing, "zoom": zoom, "just ended": justEnded, "older than 3 days": old} {
		if got := recordingOf(id); got != "" {
			t.Errorf("%s session got recording %q, want none", name, got)
		}
	}
	for _, url := range finder.asked {
		switch url {
		case "https://zoom.us/j/1", "https://meet.google.com/eee-eeee-eee", "https://meet.google.com/fff-ffff-fff", "https://meet.google.com/ddd-dddd-ddd":
			t.Errorf("asked Google about %s, which should be skipped", url)
		}
	}
	if len(finder.shared["f1"]) != 1 {
		t.Errorf("shared f1 with %v, want the session's one invited fellow", finder.shared["f1"])
	}

	// The next run finds the processing recording once Meet has finished it, and doesn't ask again about saved ones
	finder.recordings["https://meet.google.com/bbb-bbbb-bbb"] = &calendar.Recording{URL: "https://drive.google.com/file/d/f2/view", FileID: "f2"}
	finder.asked = nil
	finder.sharing = false
	NewRecordingSync(repo, finder, nil).RunOnce(ctx, now.Add(15*time.Minute))
	if got := recordingOf(processing); got != "https://drive.google.com/file/d/f2/view" {
		t.Errorf("processing session recording = %q after the next run", got)
	}
	for _, url := range finder.asked {
		if url == "https://meet.google.com/aaa-aaaa-aaa" {
			t.Error("asked again about a session that already has its recording")
		}
	}
	if _, ok := finder.shared["f2"]; ok {
		t.Error("shared a recording while sharing is off")
	}
}
