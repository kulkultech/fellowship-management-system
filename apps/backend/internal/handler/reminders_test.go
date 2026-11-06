package handler

import (
	"strings"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/model"
)

func TestReminderRuleWindows(t *testing.T) {
	now := time.Date(2026, 11, 10, 2, 0, 0, 0, time.UTC) // 09:00 WIB
	longAgo := now.Add(-7 * 24 * time.Hour)
	cases := []struct {
		name    string
		rule    reminderRule
		dueIn   time.Duration
		created time.Time
		want    bool
	}{
		{"day: starts in 23h", sessionDayRule, 23 * time.Hour, longAgo, true},
		{"day: starts in 25h (too early)", sessionDayRule, 25 * time.Hour, longAgo, false},
		{"day: starts in 6h (window passed, hour reminder covers it)", sessionDayRule, 6 * time.Hour, longAgo, false},
		{"day: created 3h ago for tomorrow (invite just sent)", sessionDayRule, 20 * time.Hour, now.Add(-3 * time.Hour), false},
		{"hour: starts in 50m", sessionHourRule, 50 * time.Minute, longAgo, true},
		{"hour: already started", sessionHourRule, -time.Minute, longAgo, false},
		{"hour: starts in 2h", sessionHourRule, 2 * time.Hour, longAgo, false},
		{"hour: created 20m ago", sessionHourRule, 40 * time.Minute, now.Add(-20 * time.Minute), false},
		{"assignment: due in 20h", assignmentDueRule, 20 * time.Hour, longAgo, true},
		{"assignment: due in 30m (too late to be useful)", assignmentDueRule, 30 * time.Minute, longAgo, false},
		{"assignment: created today, due tonight", assignmentDueRule, 10 * time.Hour, now.Add(-time.Hour), false},
	}
	for _, c := range cases {
		if got := c.rule.wants(now, now.Add(c.dueIn), c.created); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestReminderWording(t *testing.T) {
	now := time.Date(2026, 11, 10, 2, 0, 0, 0, time.UTC) // Tue 10 Nov, 09:00 WIB
	if got := whenText(now.Add(10*time.Hour), now); got != "today at 19:00 WIB" {
		t.Errorf("today: %q", got)
	}
	if got := whenText(now.Add(24*time.Hour), now); got != "tomorrow at 09:00 WIB" {
		t.Errorf("tomorrow: %q", got)
	}
	if got := whenText(now.Add(72*time.Hour), now); got != "on Fri, 13 Nov at 09:00 WIB" {
		t.Errorf("later: %q", got)
	}
	if got := soonText(now.Add(58*time.Minute), now); got != "in 1 hour" {
		t.Errorf("soon: %q", got)
	}
	if got := soonText(now.Add(27*time.Minute), now); got != "in 25 minutes" {
		t.Errorf("soon 25: %q", got)
	}
}

func TestAssignmentFellowsWhoStillNeedTheReminder(t *testing.T) {
	// The reminder goes to fellows the assignment is for who haven't submitted; drafts never qualify.
	a := &model.ProgramAssignment{Status: model.AssignmentStatusDraft}
	if assignmentIsFor(model.Applicant{}, a) {
		t.Fatal("drafts are never for anyone")
	}
	if !strings.Contains(assignmentDueRule.Kind, "assignment") {
		t.Fatal("kind names identify the reminder")
	}
}
