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
	// Source is the book chapter a module was imported from (see CurriculumSource); a new import
	// replaces its title and content. Empty for modules written in FellowHire.
	Source     string `json:"source,omitempty"`
	SourceFile string `json:"source_file,omitempty"`
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
	// CurriculumSource is the book the curriculum was last imported from (staff only).
	CurriculumSource *CurriculumSource `json:"curriculum_source,omitempty"`
}

// CurriculumSource is where a curriculum's modules were imported from: a Leanpub-style book
// (Book.txt plus Markua chapters) in a GitHub repository or an uploaded zip.
type CurriculumSource struct {
	Kind       string     `json:"kind"`           // github | zip
	Repo       string     `json:"repo,omitempty"` // owner/name
	Ref        string     `json:"ref,omitempty"`  // branch, tag or commit; empty: default branch
	Path       string     `json:"path,omitempty"` // folder holding the book, when not found by itself
	Commit     string     `json:"commit,omitempty"`
	FileName   string     `json:"file_name,omitempty"`
	BookDir    string     `json:"book_dir,omitempty"`
	ImportedAt time.Time  `json:"imported_at"`
	ImportedBy *uuid.UUID `json:"imported_by,omitempty"`
}
