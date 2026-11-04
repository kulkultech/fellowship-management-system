package email

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/model"
)

// An invite for a session without a meeting link must not point at a Meet room that doesn't exist.
func TestSessionInvitationWithoutMeetLink(t *testing.T) {
	sess := &model.ProgramSession{ID: uuid.New(), Title: "Kickoff", StartTime: time.Now(), EndTime: time.Now().Add(time.Hour)}
	_, html, text := buildSessionInvitationEmail("Ana", "Bootcamp", "", sess, "https://calendar.google.com/x", "https://app", "support@app")
	if strings.Contains(html, "meet.google.com") || strings.Contains(text, "meet.google.com") {
		t.Fatal("invite links to a Meet room that doesn't exist")
	}
	if strings.Contains(html, "Join Google Meet") {
		t.Error("invite shows a Join button with no meeting")
	}
	if !strings.Contains(html, "Link will be shared before the session") {
		t.Error("invite doesn't say the link comes later")
	}

	sess.MeetingURL = "https://meet.google.com/abc-defg-hij"
	_, html, text = buildSessionInvitationEmail("Ana", "Bootcamp", "", sess, "https://calendar.google.com/x", "https://app", "support@app")
	if !strings.Contains(html, `href="https://meet.google.com/abc-defg-hij"`) || !strings.Contains(html, "Join Google Meet") || !strings.Contains(text, "abc-defg-hij") {
		t.Error("invite is missing the real meeting link")
	}
}
