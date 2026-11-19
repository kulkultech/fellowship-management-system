package handler

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/calendar"
	"github.com/kulkul/backend/internal/model"
)

// fakeHostCalendar hosts events as a @kulkul.tech mentor, or as ragil@kulkul.tech otherwise.
type fakeHostCalendar struct {
	created []calendar.CreateEventRequest
	deleted []string // "eventID as host"
}

func (f *fakeHostCalendar) HostFor(email string) string {
	if e := strings.ToLower(email); strings.HasSuffix(e, "@kulkul.tech") {
		return e
	}
	return "ragil@kulkul.tech"
}

func (f *fakeHostCalendar) CreateEvent(_ context.Context, req calendar.CreateEventRequest) (*calendar.EventResult, error) {
	f.created = append(f.created, req)
	return &calendar.EventResult{EventID: "new-event", HTMLLink: "https://calendar.google.com/new", MeetingURL: "https://meet.google.com/new-meet-abc", Host: f.HostFor(req.HostEmail)}, nil
}

func (f *fakeHostCalendar) UpdateEvent(_ context.Context, eventID string, _ calendar.CreateEventRequest) (*calendar.EventResult, error) {
	return &calendar.EventResult{EventID: eventID}, nil
}

func (f *fakeHostCalendar) DeleteEvent(_ context.Context, eventID, host string) error {
	f.deleted = append(f.deleted, eventID+" as "+host)
	return nil
}

func (f *fakeHostCalendar) GenerateGoogleCalendarWebURL(string, string, string, time.Time, time.Time, []string) string {
	return ""
}

func (f *fakeHostCalendar) GenerateICS(string, string, string, time.Time, time.Time, string, string, []calendar.Attendee) []byte {
	return nil
}

func TestSessionMovesToItsWorkspaceMentor(t *testing.T) {
	ctx := context.Background()
	session := func(host, link string) *model.ProgramSession {
		return &model.ProgramSession{GoogleCalendarEventID: "old-event", GoogleCalendarHost: host, MeetingURL: link}
	}
	meet := "https://meet.google.com/old-meet-xyz"

	cal := &fakeHostCalendar{}
	h := &SessionHandler{calendarService: cal}

	// Hosted by the default account; a @kulkul.tech mentor now teaches it
	s := session("", meet)
	if !h.moveToMentorsCalendar(ctx, s, calendar.CreateEventRequest{MeetingURL: meet}, "Umar@kulkul.tech") {
		t.Fatal("expected the event to move to the mentor")
	}
	if len(cal.created) != 1 || cal.created[0].HostEmail != "Umar@kulkul.tech" || !cal.created[0].AutoGenerateMeet || cal.created[0].MeetingURL != "" {
		t.Fatalf("created = %+v", cal.created)
	}
	if len(cal.deleted) != 1 || cal.deleted[0] != "old-event as " {
		t.Fatalf("deleted = %v", cal.deleted)
	}
	if s.GoogleCalendarEventID != "new-event" || s.GoogleCalendarHost != "umar@kulkul.tech" || s.MeetingURL != "https://meet.google.com/new-meet-abc" {
		t.Fatalf("session = %+v", s)
	}

	// The mentor is removed: back to the default account
	cal = &fakeHostCalendar{}
	h.calendarService = cal
	s = session("umar@kulkul.tech", meet)
	if !h.moveToMentorsCalendar(ctx, s, calendar.CreateEventRequest{}, "") || s.GoogleCalendarHost != "ragil@kulkul.tech" || cal.deleted[0] != "old-event as umar@kulkul.tech" {
		t.Fatalf("expected a move back to the default account; session = %+v, deleted = %v", s, cal.deleted)
	}

	// Nothing moves when the host stays the same, for a Gmail mentor, or for a non-Meet link
	for name, tc := range map[string]struct {
		s      *model.ProgramSession
		mentor string
	}{
		"same mentor":     {session("umar@kulkul.tech", meet), "umar@kulkul.tech"},
		"gmail mentor":    {session("", meet), "mentor@gmail.com"},
		"default, stored": {session("ragil@kulkul.tech", meet), ""},
		"zoom link":       {session("", "https://zoom.us/j/1"), "umar@kulkul.tech"},
	} {
		cal = &fakeHostCalendar{}
		h.calendarService = cal
		if h.moveToMentorsCalendar(ctx, tc.s, calendar.CreateEventRequest{}, tc.mentor) || len(cal.created) != 0 || len(cal.deleted) != 0 {
			t.Errorf("%s: expected no move", name)
		}
	}
}
