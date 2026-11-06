package email

import (
	"strings"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/model"
)

func TestBuildAssignmentEmail(t *testing.T) {
	due := time.Date(2026, 11, 20, 16, 0, 0, 0, time.UTC) // 23:00 WIB
	a := &model.ProgramAssignment{Title: "KV <Store>", Description: strings.Repeat("x", 400), MaxScore: 50, DueDate: &due}
	subject, html, text := buildAssignmentEmail("Jane", "RSA 2026", a, "https://fellowhire.test/programs/acme/rsa/room?section=assignments&item=1", "https://fellowhire.test", "support@test")

	if subject != "New assignment: KV <Store> - RSA 2026" {
		t.Errorf("subject = %q", subject)
	}
	for _, want := range []string{"KV &lt;Store&gt;", "Friday, 20 Nov 2026, 23:00 WIB", "Open Assignment", "section=assignments&amp;item=1", "…"} {
		if !strings.Contains(html, want) {
			t.Errorf("html is missing %q", want)
		}
	}
	if strings.Contains(html, "<Store>") {
		t.Error("title must be escaped in HTML")
	}
	if !strings.Contains(text, "Points: 50") {
		t.Errorf("text = %q", text)
	}
}

func TestSessionInviteCalendarFallback(t *testing.T) {
	start := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	s := &model.ProgramSession{Title: "Rust & Async", StartTime: start, EndTime: start.Add(90 * time.Minute), MeetingURL: "https://meet.google.com/abc-defg-hij"}
	_, html, _ := buildSessionInvitationEmail("Jane", "RSA 2026", "", s, "", "https://fellowhire.test", "support@test")
	if !strings.Contains(html, "https://calendar.google.com/calendar/render?action=TEMPLATE") ||
		!strings.Contains(html, "dates=20261120T120000Z%2F20261120T133000Z") {
		t.Error("without a Google Calendar event the invite should link to an add-event page")
	}
	if strings.Contains(html, `href="" target="_blank"`) {
		t.Error("calendar button must not have an empty link")
	}
}

func TestReminderEmails(t *testing.T) {
	start := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	s := &model.ProgramSession{Title: "Async Rust", StartTime: start, EndTime: start.Add(time.Hour)}
	subject, html, text := buildSessionReminderEmail("Jane", "RSA 2026", "", s, "", "in 1 hour", "https://fellowhire.test", "support@test")
	if subject != "Reminder: Async Rust starts in 1 hour - RSA 2026" || !strings.Contains(html, "Session Reminder") ||
		!strings.Contains(html, "Async Rust starts in 1 hour") || !strings.Contains(text, "Reminder: your RSA 2026 session starts in 1 hour.") {
		t.Errorf("session reminder: %q / %q", subject, text)
	}

	due := start
	a := &model.ProgramAssignment{Title: "KV Store", MaxScore: 100, DueDate: &due}
	subject, html, _ = buildAssignmentReminderEmail("Jane", "RSA 2026", a, "tomorrow at 19:00 WIB", "https://x/room", "https://fellowhire.test", "support@test")
	if subject != "Reminder: KV Store is due tomorrow at 19:00 WIB - RSA 2026" || !strings.Contains(html, "Assignment Reminder") ||
		!strings.Contains(html, "submitted this") {
		t.Errorf("assignment reminder: %q", subject)
	}

	// The invite and the new-assignment email are unchanged
	subject, html, _ = buildSessionInvitationEmail("Jane", "RSA 2026", "", s, "", "https://fellowhire.test", "support@test")
	if subject != "Calendar Invitation: Async Rust - RSA 2026" || !strings.Contains(html, "invited to Async Rust") {
		t.Errorf("invite changed: %q", subject)
	}
}
