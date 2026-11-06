package model

import (
	"time"

	"github.com/google/uuid"
)

// CurriculumItem is one module or milestone in a program's curriculum.
type CurriculumItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	StartDate   string `json:"start_date,omitempty"` // YYYY-MM-DD
	EndDate     string `json:"end_date,omitempty"`   // YYYY-MM-DD
	// Who the module is for, like assignments and sessions: everyone when both are empty,
	// one track, and/or a list of fellows (a group or one person).
	TrackID            *uuid.UUID  `json:"track_id,omitempty"`
	TargetApplicantIDs []uuid.UUID `json:"target_applicant_ids,omitempty"`
}

// IsFor reports whether a fellow (their application) is in this module's audience.
func (c CurriculumItem) IsFor(applicantID uuid.UUID, trackID *uuid.UUID) bool {
	return AudienceIncludes(c.TrackID, c.TargetApplicantIDs, applicantID, trackID)
}

// AudienceIncludes reports whether a fellow is in an audience of a track (nil: every track) and a
// list of fellows (empty: everyone in that track).
func AudienceIncludes(audienceTrack *uuid.UUID, targets []uuid.UUID, applicantID uuid.UUID, trackID *uuid.UUID) bool {
	if audienceTrack != nil && (trackID == nil || *trackID != *audienceTrack) {
		return false
	}
	if len(targets) == 0 {
		return true
	}
	for _, id := range targets {
		if id == applicantID {
			return true
		}
	}
	return false
}

// RoomResource is a link fellows use during the program (chat channel, repository, document…).
type RoomResource struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
	Category    string `json:"category"` // channel | repository | document | link
}

// ProgramRoomContent holds the curriculum and resources shown in a program's room.
type ProgramRoomContent struct {
	ProgramID  uuid.UUID        `json:"program_id"`
	Curriculum []CurriculumItem `json:"curriculum"`
	Resources  []RoomResource   `json:"resources"`
	UpdatedAt  *time.Time       `json:"updated_at,omitempty"`
}
