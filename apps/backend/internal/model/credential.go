package model

import (
	"time"

	"github.com/google/uuid"
)

type BadgeType string

const (
	BadgeTypeMember     BadgeType = "member"
	BadgeTypeCompletion BadgeType = "completion"
)

type Badge struct {
	ID             uuid.UUID              `json:"id"`
	ApplicantID    uuid.UUID              `json:"applicant_id"`
	ProgramID      uuid.UUID              `json:"program_id"`
	OrganizationID uuid.UUID              `json:"organization_id"`
	BadgeType      BadgeType              `json:"badge_type"`
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	ImageURL       string                 `json:"image_url"`
	CriteriaURL    string                 `json:"criteria_url,omitempty"`
	IssuedAt       time.Time              `json:"issued_at"`
	RevokedAt      *time.Time             `json:"revoked_at,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`

	// Hydrated fields
	RecipientName    string `json:"recipient_name,omitempty"`
	RecipientEmail   string `json:"recipient_email,omitempty"`
	ProgramName      string `json:"program_name,omitempty"`
	OrganizationName string `json:"organization_name,omitempty"`
	AssertionURL     string `json:"assertion_url,omitempty"`
	VerificationURL  string `json:"verification_url,omitempty"`
}

type CertificateStatus string

const (
	CertificateStatusIssued  CertificateStatus = "issued"
	CertificateStatusRevoked CertificateStatus = "revoked"
)

// Certificate metadata keys for admin-provided display details
const (
	CertMetaSignatories     = "signatories"      // []CertificateSignatory
	CertMetaIntroText       = "intro_text"       // line above the recipient name
	CertMetaDescriptionText = "description_text" // paragraph below the recipient name
)

// CertificateSignatory is a person who signs the certificate (e.g. Program Director).
type CertificateSignatory struct {
	Name           string `json:"name"`
	Role           string `json:"role"`
	SignatureImage string `json:"signature_image,omitempty"` // data URL (image/png, image/jpeg, image/webp)
}

type Certificate struct {
	ID                uuid.UUID              `json:"id"`
	CertificateNumber string                 `json:"certificate_number"` // e.g. "CERT-2026-XXXXXX"
	ApplicantID       uuid.UUID              `json:"applicant_id"`
	ProgramID         uuid.UUID              `json:"program_id"`
	OrganizationID    uuid.UUID              `json:"organization_id"`
	RecipientName     string                 `json:"recipient_name"`
	RecipientEmail    string                 `json:"recipient_email"`
	ProgramName       string                 `json:"program_name"`
	TrackName         string                 `json:"track_name,omitempty"`
	IssueDate         time.Time              `json:"issue_date"`
	CompletionDate    time.Time              `json:"completion_date"`
	Status            CertificateStatus      `json:"status"`
	VerificationCode  string                 `json:"verification_code"`
	EmailSentAt       *time.Time             `json:"email_sent_at,omitempty"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt         time.Time              `json:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at"`

	// Hydrated fields
	VerificationURL  string `json:"verification_url,omitempty"`
	LinkedInURL      string `json:"linkedin_url,omitempty"`
	OrganizationName string `json:"organization_name,omitempty"`
}

// Open Badges v2.0 JSON-LD specification structures
type OpenBadgeAssertion struct {
	Context      string                 `json:"@context"`
	ID           string                 `json:"id"`
	Type         string                 `json:"type"` // "Assertion"
	Recipient    OpenBadgeRecipient     `json:"recipient"`
	Badge        string                 `json:"badge"` // URL to badge class
	Verification OpenBadgeVerification  `json:"verification"`
	IssuedOn     string                 `json:"issuedOn"` // ISO 8601
	Evidence     string                 `json:"evidence,omitempty"`
	Narrative    string                 `json:"narrative,omitempty"`
}

type OpenBadgeRecipient struct {
	Type     string `json:"type"` // "email"
	Hashed   bool   `json:"hashed"`
	Identity string `json:"identity"`       // "sha256$<hex>" when hashed
	Salt     string `json:"salt,omitempty"` // appended to the identity before hashing
}

// OpenBadgeRevokedAssertion is returned (with 410 Gone) for a revoked hosted assertion.
type OpenBadgeRevokedAssertion struct {
	Context string `json:"@context"`
	ID      string `json:"id"`
	Type    string `json:"type"` // "Assertion"
	Revoked bool   `json:"revoked"`
}

type OpenBadgeVerification struct {
	Type string `json:"type"` // "hosted"
}

type OpenBadgeClass struct {
	Context     string            `json:"@context"`
	ID          string            `json:"id"`
	Type        string            `json:"type"` // "BadgeClass"
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Image       string            `json:"image"`
	Criteria    OpenBadgeCriteria `json:"criteria"`
	Issuer      string            `json:"issuer"`
	Tags        []string          `json:"tags,omitempty"`
}

type OpenBadgeCriteria struct {
	Narrative string `json:"narrative"`
}

type OpenBadgeIssuer struct {
	Context     string `json:"@context"`
	ID          string `json:"id"`
	Type        string `json:"type"` // "Issuer"
	Name        string `json:"name"`
	URL         string `json:"url"`
	Email       string `json:"email"`
	Description string `json:"description"`
}

type PublicCertificateVerification struct {
	Valid             bool        `json:"valid"`
	CertificateNumber string      `json:"certificate_number"`
	RecipientName     string      `json:"recipient_name"`
	ProgramName       string      `json:"program_name"`
	TrackName         string      `json:"track_name,omitempty"`
	OrganizationName  string      `json:"organization_name"`
	IssueDate         time.Time   `json:"issue_date"`
	CompletionDate    time.Time   `json:"completion_date"`
	Status            string      `json:"status"`
	VerificationCode  string      `json:"verification_code"`
	VerificationURL   string      `json:"verification_url"`
	LinkedInURL       string      `json:"linkedin_url"`
	Badges            []*Badge    `json:"badges"`
	Certificate       *Certificate `json:"certificate"`
}

type PublicBadgeVerification struct {
	Valid          bool      `json:"valid"`
	BadgeID        string    `json:"badge_id"`
	BadgeType      string    `json:"badge_type"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	ImageURL       string    `json:"image_url"`
	RecipientName  string    `json:"recipient_name"`
	ProgramName    string    `json:"program_name"`
	OrganizationName string  `json:"organization_name"`
	IssuedAt       time.Time `json:"issued_at"`
	AssertionURL   string    `json:"assertion_url"`
	BadgeClassURL  string    `json:"badge_class_url"`
	IssuerURL      string    `json:"issuer_url"`
	Badge          *Badge    `json:"badge,omitempty"`
}
