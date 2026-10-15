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
