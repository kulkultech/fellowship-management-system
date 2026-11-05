package handler

import (
	"testing"

	"github.com/kulkul/backend/internal/model"
)

func TestSessionSearchAndFellowStats(t *testing.T) {
	att := func(status string) *model.SessionAttendance {
		return &model.SessionAttendance{Status: model.AttendanceStatus(status)}
	}
	sessions := []model.ProgramSession{
		{Title: "Kickoff", MentorName: "Ana", FellowAttendance: att("present")},
		{Title: "Rust workshop", FellowAttendance: att("late")},
		{Title: "Demo day", FellowAttendance: att("pending_validation")},
		{Title: "Wrap-up"},
	}
	if !sessionMatches(sessions[0], "ana") || !sessionMatches(sessions[1], "rust") || sessionMatches(sessions[3], "rust") {
		t.Error("search should match title and mentor name")
	}
	stats := fellowAttendanceStats(sessions)
	if stats["total"] != 4 || stats["attended"] != 2 || stats["pending"] != 1 {
		t.Errorf("stats = %v", stats)
	}
}
