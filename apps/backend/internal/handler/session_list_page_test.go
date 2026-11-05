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

func TestAttendanceMetrics(t *testing.T) {
	m := attendanceMetrics([]int{100, 70, 40}, []string{"Good", "Warning", "At Risk"})
	if m["total"] != 3 || m["good"] != 1 || m["warning"] != 1 || m["at_risk"] != 1 || m["avg_attendance_rate"] != 70 {
		t.Errorf("metrics = %v", m)
	}
	if empty := attendanceMetrics(nil, nil); empty["avg_attendance_rate"] != nil || empty["total"] != 0 {
		t.Errorf("empty metrics = %v", empty)
	}
}

func TestAssignmentFellowStats(t *testing.T) {
	score := func(v float64) *float64 { return &v }
	stats := assignmentFellowStats([]*model.ProgramAssignment{
		{MaxScore: 100, MySubmission: &model.AssignmentSubmission{Score: score(80)}},
		{MaxScore: 50, MySubmission: &model.AssignmentSubmission{}},
		{MaxScore: 100},
		{MaxScore: 100},
	})
	if stats["total"] != 4 || stats["submitted"] != 2 || stats["graded"] != 1 || stats["completion_rate"] != 50 || stats["avg_score"] != 80 {
		t.Errorf("stats = %v", stats)
	}
}
