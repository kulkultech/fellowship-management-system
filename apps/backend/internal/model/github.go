package model

import (
	"time"

	"github.com/google/uuid"
)

type GitHubSyncStatus string

const (
	GitHubSyncIdle    GitHubSyncStatus = "idle"
	GitHubSyncSyncing GitHubSyncStatus = "syncing"
	GitHubSyncSuccess GitHubSyncStatus = "success"
	GitHubSyncError   GitHubSyncStatus = "error"
)

// GitHubContributionCounts is what one GitHub user contributed to a repository.
type GitHubContributionCounts struct {
	Commits            int `json:"commits"`
	PullRequests       int `json:"pull_requests"`
	PullRequestsMerged int `json:"pull_requests_merged"`
	Issues             int `json:"issues"`
	PRComments         int `json:"pr_comments"`
	ReviewComments     int `json:"review_comments"`
	IssueComments      int `json:"issue_comments"`
}

func (c *GitHubContributionCounts) Add(o GitHubContributionCounts) {
	c.Commits += o.Commits
	c.PullRequests += o.PullRequests
	c.PullRequestsMerged += o.PullRequestsMerged
	c.Issues += o.Issues
	c.PRComments += o.PRComments
	c.ReviewComments += o.ReviewComments
	c.IssueComments += o.IssueComments
}

// ProgramGitHubRepo is a repository a mentor or admin tracks for a program.
type ProgramGitHubRepo struct {
	ID            uuid.UUID        `json:"id"`
	ProgramID     uuid.UUID        `json:"program_id"`
	Owner         string           `json:"owner"`
	Name          string           `json:"name"`
	FullName      string           `json:"full_name"`
	HTMLURL       string           `json:"html_url"`
	AddedBy       *uuid.UUID       `json:"added_by,omitempty"`
	SyncStatus    GitHubSyncStatus `json:"sync_status"`
	SyncError     string           `json:"sync_error,omitempty"`
	SyncTruncated bool             `json:"sync_truncated"`
	SyncStartedAt *time.Time       `json:"sync_started_at,omitempty"`
	LastSyncedAt  *time.Time       `json:"last_synced_at,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`

	// Contributions keyed by lowercase GitHub login (all contributors, not only fellows)
	Contributions map[string]GitHubContributionCounts `json:"-"`
}

// GitHubFellowActivity is a fellow's contribution totals across a program's tracked repositories.
type GitHubFellowActivity struct {
	ApplicantID uuid.UUID                           `json:"applicant_id"`
	FullName    string                              `json:"full_name"`
	Email       string                              `json:"email"`
	GitHubURL   string                              `json:"github_url,omitempty"`
	GitHubLogin string                              `json:"github_login,omitempty"`
	Totals      GitHubContributionCounts            `json:"totals"`
	ByRepo      map[string]GitHubContributionCounts `json:"by_repo"` // keyed by repo id
}
