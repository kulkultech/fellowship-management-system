package model

import (
	"time"

	"github.com/google/uuid"
)

type ApplicantStage string

const (
	StageRegistered           ApplicantStage = "registered"
	StageTestInProgress       ApplicantStage = "test_in_progress"
	StageTestCompleted        ApplicantStage = "test_completed"
	StageTestFailed           ApplicantStage = "test_failed"
	StageAIInterviewInvited   ApplicantStage = "ai_interview_invited"
	StageAIInterviewCompleted ApplicantStage = "ai_interview_completed"
	StageApprovedForLive      ApplicantStage = "approved_for_live"
	StageRejected             ApplicantStage = "rejected"
)

type Applicant struct {
	ID             uuid.UUID      `json:"id"`
	OrganizationID uuid.UUID      `json:"organization_id"`
	ProgramID      uuid.UUID      `json:"program_id"`
	TrackID        *uuid.UUID     `json:"track_id,omitempty"`
	Email          string         `json:"email"`
	FullName       string         `json:"full_name"`
	FirstName      string         `json:"first_name,omitempty"`
	LastName       string         `json:"last_name,omitempty"`
	DateOfBirth    string         `json:"date_of_birth,omitempty"`
	Phone          string         `json:"phone,omitempty"`
	GitHubURL      string         `json:"github_url,omitempty"`
	LinkedInURL       string         `json:"linkedin_url,omitempty"`
	ResumeURL         string         `json:"resume_url,omitempty"`
	ProfilePictureURL string         `json:"profile_picture_url,omitempty"`
	University     string         `json:"university,omitempty"`
	Major          string         `json:"major,omitempty"`
	Semester       string         `json:"semester,omitempty"`
	ReferralSource string         `json:"referral_source,omitempty"`
	CurrentStage   ApplicantStage `json:"current_stage"`
	Notes          string         `json:"notes,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}
