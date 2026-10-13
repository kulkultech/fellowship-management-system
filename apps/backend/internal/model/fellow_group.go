package model

import (
	"time"

	"github.com/google/uuid"
)

// FellowGroup is a named set of a program's fellows, used to target sessions and assignments quickly.
type FellowGroup struct {
	ID        uuid.UUID   `json:"id"`
	ProgramID uuid.UUID   `json:"program_id"`
	Name      string      `json:"name"`
	MemberIDs []uuid.UUID `json:"member_ids"`
	CreatedBy *uuid.UUID  `json:"created_by,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}
