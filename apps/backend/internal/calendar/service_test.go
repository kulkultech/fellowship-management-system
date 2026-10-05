package calendar_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/calendar"
)

func TestGoogleMeetLinkGeneration(t *testing.T) {
	svc := calendar.NewService(calendar.Config{}, nil)

	link1 := svc.GenerateMeetLink()
	link2 := svc.GenerateMeetLink()

	if !strings.HasPrefix(link1, "https://meet.google.com/") {
		t.Errorf("expected link to start with https://meet.google.com/, got %s", link1)
	}

	// Verify format xxx-yyyy-zzz (total code length 3 + 1 + 4 + 1 + 3 = 12 chars)
	code := strings.TrimPrefix(link1, "https://meet.google.com/")
	parts := strings.Split(code, "-")
	if len(parts) != 3 || len(parts[0]) != 3 || len(parts[1]) != 4 || len(parts[2]) != 3 {
		t.Errorf("expected format xxx-yyyy-zzz, got code: %s", code)
	}

	if link1 == link2 {
		t.Errorf("expected consecutive meet links to be unique, got duplicate %s", link1)
	}
}

func TestGenerateGoogleCalendarWebURL(t *testing.T) {
	svc := calendar.NewService(calendar.Config{}, nil)

	start := time.Date(2026, 10, 12, 19, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 12, 20, 30, 0, 0, time.UTC)
	attendees := []string{"fellow1@example.com", "mentor@example.com"}

	webURL := svc.GenerateGoogleCalendarWebURL(
		"Mastering System Architecture",
		"Deep dive into distributed cache invalidation",
		"https://meet.google.com/abc-defg-hij",
		start,
		end,
		attendees,
	)

	if !strings.HasPrefix(webURL, "https://calendar.google.com/calendar/render?") {
		t.Errorf("expected url to start with calendar.google.com render, got %s", webURL)
	}
	if !strings.Contains(webURL, "action=TEMPLATE") {
		t.Errorf("expected action=TEMPLATE in url")
	}
	if !strings.Contains(webURL, "20261012T190000Z%2F20261012T203000Z") && !strings.Contains(webURL, "20261012T190000Z") {
		t.Errorf("expected UTC timestamp in url, got %s", webURL)
	}
	if !strings.Contains(webURL, "fellow1%40example.com") && !strings.Contains(webURL, "fellow1@example.com") {
		t.Errorf("expected attendee in url, got %s", webURL)
	}
}

func TestGenerateICS(t *testing.T) {
	svc := calendar.NewService(calendar.Config{}, nil)

	start := time.Date(2026, 10, 12, 19, 0, 0, 0, time.UTC)
	end := time.Date(2026, 10, 12, 20, 30, 0, 0, time.UTC)
	attendees := []calendar.Attendee{
		{Name: "Jane Fellow", Email: "jane@example.com", Role: "fellow"},
		{Name: "Alex Mentor", Email: "alex@example.com", Role: "mentor"},
	}

	icsBytes := svc.GenerateICS(
		"Cohort Workshop",
		"Live coding session",
		"https://meet.google.com/xyz-abcd-efg",
		start,
		end,
		"admissions@fellowhire.com",
		"FellowHire Host",
		attendees,
	)

	ics := string(icsBytes)

	if !strings.Contains(ics, "BEGIN:VCALENDAR") || !strings.Contains(ics, "END:VCALENDAR") {
		t.Errorf("missing VCALENDAR envelope in ICS")
	}
	if !strings.Contains(ics, "BEGIN:VEVENT") || !strings.Contains(ics, "END:VEVENT") {
		t.Errorf("missing VEVENT in ICS")
	}
	if !strings.Contains(ics, "METHOD:REQUEST") {
		t.Errorf("missing METHOD:REQUEST in ICS")
	}
	if !strings.Contains(ics, "SUMMARY:Cohort Workshop") {
		t.Errorf("missing SUMMARY in ICS")
	}
	if !strings.Contains(ics, "LOCATION:https://meet.google.com/xyz-abcd-efg") {
		t.Errorf("missing LOCATION in ICS")
	}
	if !strings.Contains(ics, "mailto:jane@example.com") {
		t.Errorf("missing attendee jane in ICS")
	}
	if !strings.Contains(ics, "mailto:alex@example.com") {
		t.Errorf("missing attendee alex in ICS")
	}
}

func TestCreateEventStandalone(t *testing.T) {
	svc := calendar.NewService(calendar.Config{}, nil)

	start := time.Now().Add(2 * time.Hour)
	end := start.Add(90 * time.Minute)

	res, err := svc.CreateEvent(context.Background(), calendar.CreateEventRequest{
		SessionID:        uuid.New(),
		ProgramID:        uuid.New(),
		Title:            "System Design Demo",
		Description:      "Live workshop demo",
		StartTime:        start,
		EndTime:          end,
		AutoGenerateMeet: true,
		Attendees: []calendar.Attendee{
			{Name: "Student 1", Email: "s1@example.com", Role: "fellow"},
		},
	})

	if err != nil {
		t.Fatalf("unexpected error creating event: %v", err)
	}

	if !strings.HasPrefix(res.MeetingURL, "https://meet.google.com/") {
		t.Errorf("expected auto-generated meet URL, got %s", res.MeetingURL)
	}
	if !strings.Contains(res.GoogleCalendarWebURL, "action=TEMPLATE") {
		t.Errorf("expected Google Calendar web URL, got %s", res.GoogleCalendarWebURL)
	}
	if len(res.ICSData) == 0 {
		t.Errorf("expected non-empty ICS data")
	}
}
