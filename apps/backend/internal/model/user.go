package model

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID             uuid.UUID  `json:"id"`
	OrganizationID *uuid.UUID `json:"organization_id,omitempty"`
	Email          string     `json:"email"`
	PasswordHash   string     `json:"-"`
	Name           string     `json:"name"`
	AvatarURL      string     `json:"avatar_url"`
	Role           string     `json:"role"` // 'superadmin', 'org_admin', 'reviewer'
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

const (
	RoleSuperadmin = "superadmin"
	RoleOrgAdmin   = "org_admin"
	RoleReviewer   = "reviewer"
	RoleCandidate  = "candidate"
)
