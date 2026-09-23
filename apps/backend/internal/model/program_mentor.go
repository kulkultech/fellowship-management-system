package model

import (
	"time"

	"github.com/google/uuid"
)

type ProgramMentor struct {
	ID         uuid.UUID `json:"id"`
	ProgramID  uuid.UUID `json:"program_id"`
	UserID     uuid.UUID `json:"user_id"`
	RoleTitle  string    `json:"role_title"`
	Bio        string    `json:"bio"`
	AssignedAt time.Time `json:"assigned_at"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`

	// Joined user & program fields
	UserName        string `json:"user_name,omitempty"`
	UserEmail       string `json:"user_email,omitempty"`
	UserAvatar      string `json:"user_avatar,omitempty"`
	ProgramName     string `json:"program_name,omitempty"`
	ProgramSlug     string `json:"program_slug,omitempty"`
	OrganizationID  *uuid.UUID `json:"organization_id,omitempty"`
	OrganizationSlug string `json:"organization_slug,omitempty"`
	OrganizationName string `json:"organization_name,omitempty"`
}

type MentorOverview struct {
	MentorID         uuid.UUID        `json:"mentor_id"`
	Name             string           `json:"name"`
	Email            string           `json:"email"`
	AvatarURL        string           `json:"avatar_url"`
	AssignedPrograms []*MentorProgramSummary `json:"assigned_programs"`
	TotalFellows     int              `json:"total_fellows"`
	ActiveSessions   int              `json:"active_sessions"`
}

type MentorProgramSummary struct {
	ProgramID       uuid.UUID  `json:"program_id"`
	ProgramSlug     string     `json:"program_slug"`
	ProgramName     string     `json:"program_name"`
	Description     string     `json:"description,omitempty"`
	ImageURL        string     `json:"image_url,omitempty"`
	OrganizationID  uuid.UUID  `json:"organization_id"`
	OrgSlug         string     `json:"org_slug"`
	OrgName         string     `json:"org_name"`
	RoleTitle       string     `json:"role_title"`
	FellowCount     int        `json:"fellow_count"`
	TrackCount      int        `json:"track_count"`
	OpenDate        time.Time  `json:"open_date"`
	EndDate         time.Time  `json:"end_date"`
}
