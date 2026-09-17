package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	InvitationStatusPending  = "pending"
	InvitationStatusAccepted = "accepted"
	InvitationStatusRevoked  = "revoked"
	InvitationStatusExpired  = "expired"
)

type Invitation struct {
	ID             uuid.UUID  `json:"id"`
	Email          string     `json:"email"`
	Role           string     `json:"role"` // 'org_admin', 'reviewer', 'superadmin'
	OrganizationID *uuid.UUID `json:"organization_id,omitempty"`
	Token          string     `json:"-"`
	InvitedBy      *uuid.UUID `json:"invited_by,omitempty"`
	Status         string     `json:"status"` // 'pending', 'accepted', 'revoked', 'expired'
	ExpiresAt      time.Time  `json:"expires_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	// Joined fields for display
	InvitedByName    string `json:"invited_by_name,omitempty"`
	OrganizationName string `json:"organization_name,omitempty"`
	OrganizationSlug string `json:"organization_slug,omitempty"`
	OrganizationLogo string `json:"organization_logo,omitempty"`
}
