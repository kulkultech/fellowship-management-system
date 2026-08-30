package model

import (
	"time"

	"github.com/google/uuid"
)

type OrgStatus string

const (
	OrgStatusPendingApproval OrgStatus = "pending_approval"
	OrgStatusApproved        OrgStatus = "approved"
	OrgStatusRejected        OrgStatus = "rejected"
)

type Organization struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	Name         string    `json:"name"`
	ContactEmail string    `json:"contact_email,omitempty"`
	LogoURL      string    `json:"logo_url,omitempty"`
	Status       OrgStatus `json:"status"` // 'pending_approval', 'approved', 'rejected'
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
