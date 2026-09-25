package model

import (
	"time"

	"github.com/google/uuid"
)

type SessionType string

const (
	SessionTypeLiveLecture    SessionType = "live_lecture"
	SessionTypeWorkshop       SessionType = "workshop"
	SessionTypeMentorshipSync SessionType = "mentorship_sync"
	SessionTypeDemoDay        SessionType = "demo_day"
	SessionTypeGeneral        SessionType = "general"
	SessionType1On1           SessionType = "1_on_1"
	SessionTypeGroupSync      SessionType = "group_sync"
)

type AttendanceStatus string

const (
	AttendanceStatusPresent AttendanceStatus = "present"
	AttendanceStatusLate    AttendanceStatus = "late"
	AttendanceStatusAbsent  AttendanceStatus = "absent"
	AttendanceStatusExcused AttendanceStatus = "excused"
)

type ProgramSession struct {
	ID                 uuid.UUID   `json:"id"`
	ProgramID          uuid.UUID   `json:"program_id"`
	TrackID            *uuid.UUID  `json:"track_id,omitempty"`
	TrackName          string      `json:"track_name,omitempty"`
	Title              string      `json:"title"`
	Description        string      `json:"description"`
	SessionType        SessionType `json:"session_type"`
	StartTime          time.Time   `json:"start_time"`
	EndTime            time.Time   `json:"end_time"`
	MeetingURL         string      `json:"meeting_url"`
	RecordingURL       string      `json:"recording_url,omitempty"`
	MentorID           *uuid.UUID  `json:"mentor_id,omitempty"`
	MentorName         string      `json:"mentor_name,omitempty"`
	TargetApplicantIDs []uuid.UUID `json:"target_applicant_ids"`
	CreatedAt          time.Time   `json:"created_at"`
	UpdatedAt          time.Time   `json:"updated_at"`

	// Attendance stats (computed on queries)
	TotalFellows   int `json:"total_fellows,omitempty"`
	PresentCount   int `json:"present_count,omitempty"`
	LateCount      int `json:"late_count,omitempty"`
	AbsentCount    int `json:"absent_count,omitempty"`
	ExcusedCount   int `json:"excused_count,omitempty"`
	AttendanceRate int `json:"attendance_rate,omitempty"`

	// Current fellow status (when queried in fellow/candidate context)
	FellowAttendance *SessionAttendance `json:"fellow_attendance,omitempty"`
}

type SessionAttendance struct {
	ID          uuid.UUID        `json:"id"`
	SessionID   uuid.UUID        `json:"session_id"`
	ApplicantID uuid.UUID        `json:"applicant_id"`
	Status      AttendanceStatus `json:"status"`
	CheckedInAt   *time.Time       `json:"checked_in_at,omitempty"`
	MarkedBy      *uuid.UUID       `json:"marked_by,omitempty"`
	Notes         string           `json:"notes,omitempty"`
	ProofImageURL string           `json:"proof_image_url,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`

	// Joined Fellow Info
	FellowName  string `json:"fellow_name,omitempty"`
	FellowEmail string `json:"fellow_email,omitempty"`
	TrackName   string `json:"track_name,omitempty"`
}

type FellowAttendanceSummary struct {
	ApplicantID    uuid.UUID `json:"applicant_id"`
	FullName       string    `json:"full_name"`
	Email          string    `json:"email"`
	TrackName      string    `json:"track_name,omitempty"`
	TotalSessions  int       `json:"total_sessions"`
	PresentCount   int       `json:"present_count"`
	LateCount      int       `json:"late_count"`
	AbsentCount    int       `json:"absent_count"`
	ExcusedCount   int       `json:"excused_count"`
	AttendanceRate int       `json:"attendance_rate"` // 0-100 percentage
	Status         string    `json:"status"`          // "Good", "Warning", "At Risk"
}
