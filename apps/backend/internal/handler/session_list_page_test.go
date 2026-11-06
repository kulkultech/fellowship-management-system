package handler

import (
	"testing"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/calendar"
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

func TestIsLinkOrUpload(t *testing.T) {
	for _, ok := range []string{"", "/uploads/a.zip", "https://github.com/acme/repo/blob/main/x.py", "http://example.com/a"} {
		if !isLinkOrUpload(ok) {
			t.Errorf("%q should be allowed", ok)
		}
	}
	for _, bad := range []string{"javascript:alert(1)", "data:text/html,x", "//evil.test/a", "ftp://x/y", "https://"} {
		if isLinkOrUpload(bad) {
			t.Errorf("%q should be rejected", bad)
		}
	}
}

func TestAssignmentProgress(t *testing.T) {
	track, otherTrack := uuid.New(), uuid.New()
	me := model.Applicant{ID: uuid.New(), TrackID: &track}
	someoneElse := uuid.New()
	score := func(v float64) *float64 { return &v }
	all := &model.ProgramAssignment{ID: uuid.New(), MaxScore: 100, Status: model.AssignmentStatusPublished}
	mine := &model.ProgramAssignment{ID: uuid.New(), MaxScore: 50, Status: model.AssignmentStatusPublished, TrackID: &track}
	targeted := &model.ProgramAssignment{ID: uuid.New(), MaxScore: 100, Status: model.AssignmentStatusPublished, TargetApplicantIDs: []uuid.UUID{me.ID}}
	notMine := &model.ProgramAssignment{ID: uuid.New(), MaxScore: 100, Status: model.AssignmentStatusPublished, TrackID: &otherTrack}
	forOthers := &model.ProgramAssignment{ID: uuid.New(), MaxScore: 100, Status: model.AssignmentStatusPublished, TargetApplicantIDs: []uuid.UUID{someoneElse}}
	draft := &model.ProgramAssignment{ID: uuid.New(), MaxScore: 100, Status: model.AssignmentStatusDraft}
	subs := []*model.AssignmentSubmission{
		{AssignmentID: all.ID, ApplicantID: me.ID, Score: score(90)},
		{AssignmentID: mine.ID, ApplicantID: me.ID, Score: score(30)},
		{AssignmentID: targeted.ID, ApplicantID: me.ID},
		{AssignmentID: all.ID, ApplicantID: someoneElse, Score: score(10)},
	}
	p := assignmentProgress(me, []*model.ProgramAssignment{all, mine, targeted, notMine, forOthers, draft}, subs)
	if p.Total != 3 || p.Submitted != 3 || p.Graded != 2 || p.AvgScore == nil || *p.AvgScore != 80 {
		t.Errorf("progress = %+v (avg %v)", p, p.AvgScore)
	}
}

func TestNewAttendees(t *testing.T) {
	before := []calendar.Attendee{{Email: "alex@example.com"}, {Email: "mentor@example.com"}}
	after := []calendar.Attendee{{Email: "Alex@Example.com"}, {Email: "mentor@example.com"}, {Email: "sarah@example.com"}, {Email: ""}, {Email: "sarah@example.com"}}
	added := newAttendees(before, after)
	if len(added) != 1 || added[0].Email != "sarah@example.com" {
		t.Errorf("added = %+v, want only sarah", added)
	}
	if len(newAttendees(after, before)) != 0 {
		t.Error("removing people should invite no one")
	}
}

func TestAssignmentRecipients(t *testing.T) {
	track := uuid.New()
	alex := model.Applicant{ID: uuid.New(), Email: "alex@example.com", TrackID: &track}
	sarah := model.Applicant{ID: uuid.New(), Email: "sarah@example.com"}
	jane := model.Applicant{ID: uuid.New(), Email: "jane@example.com"}
	noEmail := model.Applicant{ID: uuid.New()}
	fellows := []model.Applicant{alex, sarah, jane, noEmail}
	names := func(list []model.Applicant) string {
		out := ""
		for _, f := range list {
			out += f.Email + ";"
		}
		return out
	}

	everyone := &model.ProgramAssignment{Status: model.AssignmentStatusPublished}
	if got := names(assignmentRecipients(fellows, nil, everyone)); got != "alex@example.com;sarah@example.com;jane@example.com;" {
		t.Errorf("new cohort-wide assignment emails %q", got)
	}

	solo := &model.ProgramAssignment{Status: model.AssignmentStatusPublished, TargetApplicantIDs: []uuid.UUID{sarah.ID}}
	plusJane := &model.ProgramAssignment{Status: model.AssignmentStatusPublished, TargetApplicantIDs: []uuid.UUID{sarah.ID, jane.ID}}
	if got := names(assignmentRecipients(fellows, solo, plusJane)); got != "jane@example.com;" {
		t.Errorf("adding Jane emails %q, want only Jane", got)
	}

	draft := &model.ProgramAssignment{Status: model.AssignmentStatusDraft, TargetApplicantIDs: []uuid.UUID{sarah.ID}}
	if got := names(assignmentRecipients(fellows, nil, draft)); got != "" {
		t.Errorf("a draft emails %q, want no one", got)
	}
	if got := names(assignmentRecipients(fellows, draft, solo)); got != "sarah@example.com;" {
		t.Errorf("publishing a draft emails %q, want Sarah", got)
	}

	trackOnly := &model.ProgramAssignment{Status: model.AssignmentStatusPublished, TrackID: &track}
	if got := names(assignmentRecipients(fellows, nil, trackOnly)); got != "alex@example.com;" {
		t.Errorf("track assignment emails %q, want Alex", got)
	}
}
