// Package github collects per-user contribution counts from GitHub repositories.
package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBaseURL = "https://api.github.com"
	perPage        = 100
	// maxPagesPerEndpoint bounds API usage per repository sync (100 items per page).
	maxPagesPerEndpoint = 30
)

var (
	ErrNotFound    = errors.New("github: repository not found or not accessible")
	ErrRateLimited = errors.New("github: API rate limit exceeded")
)

type Client struct {
	httpClient *http.Client
	token      string
	baseURL    string
}

func NewClient(token string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		token:      strings.TrimSpace(token),
		baseURL:    defaultBaseURL,
	}
}

// WithBaseURL points the client at a different API host (used in tests).
func (c *Client) WithBaseURL(baseURL string) *Client {
	c.baseURL = strings.TrimRight(baseURL, "/")
	return c
}

// HasToken reports whether requests are authenticated (higher rate limits, private repos).
func (c *Client) HasToken() bool {
	return c.token != ""
}

type Repo struct {
	FullName string `json:"full_name"`
	Name     string `json:"name"`
	HTMLURL  string `json:"html_url"`
	Private  bool   `json:"private"`
	Owner    struct {
		Login string `json:"login"`
	} `json:"owner"`
}

// ContributionCounts holds what one GitHub user contributed to a repository.
type ContributionCounts struct {
	Commits            int `json:"commits"`
	PullRequests       int `json:"pull_requests"`
	PullRequestsMerged int `json:"pull_requests_merged"`
	Issues             int `json:"issues"`
	PRComments         int `json:"pr_comments"`
	ReviewComments     int `json:"review_comments"`
	IssueComments      int `json:"issue_comments"`
}

// RepoActivity is the contribution snapshot of a repository, keyed by lowercase login.
type RepoActivity struct {
	Contributors map[string]*ContributionCounts
	// Truncated is true when an endpoint had more items than maxPagesPerEndpoint allows.
	Truncated bool
}

func (c *Client) GetRepo(ctx context.Context, owner, name string) (*Repo, error) {
	var repo Repo
	if _, err := c.getJSON(ctx, fmt.Sprintf("/repos/%s/%s", url.PathEscape(owner), url.PathEscape(name)), &repo); err != nil {
		return nil, err
	}
	return &repo, nil
}

// CollectRepoActivity counts commits, pull requests, issues, and comments per user.
func (c *Client) CollectRepoActivity(ctx context.Context, owner, name string) (*RepoActivity, error) {
	activity := &RepoActivity{Contributors: make(map[string]*ContributionCounts)}
	counts := func(login string) *ContributionCounts {
		key := strings.ToLower(login)
		if activity.Contributors[key] == nil {
			activity.Contributors[key] = &ContributionCounts{}
		}
		return activity.Contributors[key]
	}
	base := fmt.Sprintf("/repos/%s/%s", url.PathEscape(owner), url.PathEscape(name))

	type user struct {
		Login string `json:"login"`
		Type  string `json:"type"`
	}
	isHuman := func(u *user) bool { return u != nil && u.Login != "" && u.Type != "Bot" }

	// Pull requests (opened and merged)
	type pull struct {
		User     *user   `json:"user"`
		MergedAt *string `json:"merged_at"`
	}
	truncated, err := listAll(ctx, c, base+"/pulls?state=all", func(p pull) {
		if !isHuman(p.User) {
			return
		}
		cnt := counts(p.User.Login)
		cnt.PullRequests++
		if p.MergedAt != nil {
			cnt.PullRequestsMerged++
		}
	})
	if err != nil {
		return nil, err
	}
	activity.Truncated = activity.Truncated || truncated

	// Issues (the issues endpoint also returns pull requests; those are recorded to classify comments)
	type issue struct {
		Number      int              `json:"number"`
		User        *user            `json:"user"`
		PullRequest *json.RawMessage `json:"pull_request"`
	}
	prNumbers := make(map[int]bool)
	truncated, err = listAll(ctx, c, base+"/issues?state=all", func(i issue) {
		if i.PullRequest != nil {
			prNumbers[i.Number] = true
			return
		}
		if isHuman(i.User) {
			counts(i.User.Login).Issues++
		}
	})
	if err != nil {
		return nil, err
	}
	activity.Truncated = activity.Truncated || truncated

	// Conversation comments on issues and pull requests
	type comment struct {
		User     *user  `json:"user"`
		IssueURL string `json:"issue_url"`
	}
	truncated, err = listAll(ctx, c, base+"/issues/comments?sort=created&direction=desc", func(cm comment) {
		if !isHuman(cm.User) {
			return
		}
		if prNumbers[issueNumberFromURL(cm.IssueURL)] {
			counts(cm.User.Login).PRComments++
		} else {
			counts(cm.User.Login).IssueComments++
		}
	})
	if err != nil {
		return nil, err
	}
	activity.Truncated = activity.Truncated || truncated

	// Inline code review comments on pull requests
	truncated, err = listAll(ctx, c, base+"/pulls/comments?sort=created&direction=desc", func(cm comment) {
		if isHuman(cm.User) {
			counts(cm.User.Login).ReviewComments++
		}
	})
	if err != nil {
		return nil, err
	}
	activity.Truncated = activity.Truncated || truncated

	// Commits on the default branch (only commits linked to a GitHub account can be attributed)
	type commit struct {
		Author *user `json:"author"`
	}
	truncated, err = listAll(ctx, c, base+"/commits", func(cm commit) {
		if isHuman(cm.Author) {
			counts(cm.Author.Login).Commits++
		}
	})
	if err != nil && !errors.Is(err, errEmptyRepository) {
		return nil, err
	}
	activity.Truncated = activity.Truncated || truncated

	return activity, nil
}

var errEmptyRepository = errors.New("github: repository is empty")

// listAll pages through a list endpoint, decoding each item into T.
func listAll[T any](ctx context.Context, c *Client, path string, each func(T)) (truncated bool, err error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	next := fmt.Sprintf("%s%sper_page=%d", path, sep, perPage)
	for page := 0; next != ""; page++ {
		if page >= maxPagesPerEndpoint {
			return true, nil
		}
		var items []T
		resp, err := c.getJSON(ctx, next, &items)
		if err != nil {
			return false, err
		}
		for _, item := range items {
			each(item)
		}
		next = nextPageURL(resp.Header.Get("Link"))
	}
	return false, nil
}

func (c *Client) getJSON(ctx context.Context, pathOrURL string, dst any) (*http.Response, error) {
	target := pathOrURL
	if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
		target = c.baseURL + pathOrURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github: request failed: %w", err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotFound:
		return nil, ErrNotFound
	case resp.StatusCode == http.StatusConflict:
		// GitHub returns 409 for listing commits of an empty repository
		return nil, errEmptyRepository
	case (resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests) &&
		resp.Header.Get("X-RateLimit-Remaining") == "0":
		if reset, err := strconv.ParseInt(resp.Header.Get("X-RateLimit-Reset"), 10, 64); err == nil {
			return nil, fmt.Errorf("%w (resets at %s)", ErrRateLimited, time.Unix(reset, 0).UTC().Format(time.RFC3339))
		}
		return nil, ErrRateLimited
	case resp.StatusCode >= 300:
		return nil, fmt.Errorf("github: unexpected status %d for %s", resp.StatusCode, pathOrURL)
	}

	if err := json.NewDecoder(resp.Body).Decode(dst); err != nil {
		return nil, fmt.Errorf("github: decode response: %w", err)
	}
	return resp, nil
}

var linkNextRe = regexp.MustCompile(`<([^>]+)>;\s*rel="next"`)

func nextPageURL(linkHeader string) string {
	if m := linkNextRe.FindStringSubmatch(linkHeader); m != nil {
		return m[1]
	}
	return ""
}

func issueNumberFromURL(issueURL string) int {
	idx := strings.LastIndex(issueURL, "/")
	if idx < 0 {
		return 0
	}
	n, _ := strconv.Atoi(issueURL[idx+1:])
	return n
}

var namePartRe = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

// ParseRepoRef accepts "owner/repo", "github.com/owner/repo", or a full repository URL.
func ParseRepoRef(input string) (owner, name string, err error) {
	s := strings.TrimSpace(input)
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "www.")
	s = strings.TrimPrefix(s, "github.com/")
	s = strings.TrimPrefix(s, "git@github.com:")
	s = strings.SplitN(s, "?", 2)[0]
	s = strings.SplitN(s, "#", 2)[0]
	parts := strings.Split(strings.Trim(s, "/"), "/")
	if len(parts) < 2 {
		return "", "", errors.New("enter a repository as owner/repo or a github.com URL")
	}
	owner = parts[0]
	name = strings.TrimSuffix(parts[1], ".git")
	if !namePartRe.MatchString(owner) || !namePartRe.MatchString(name) {
		return "", "", errors.New("invalid GitHub repository name")
	}
	return owner, name, nil
}

var usernameRe = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)

// UsernameFromProfile extracts a GitHub login from a profile URL or "@username" value.
// It returns "" when the value does not look like a GitHub profile.
func UsernameFromProfile(profile string) string {
	s := strings.TrimSpace(profile)
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	hasHost := strings.Contains(lower, "github.com")
	if strings.Contains(lower, "://") || strings.Contains(lower, ".") {
		if !hasHost {
			return ""
		}
		idx := strings.Index(lower, "github.com")
		s = s[idx+len("github.com"):]
	}
	s = strings.TrimPrefix(strings.Trim(s, "/"), "@")
	s = strings.SplitN(s, "/", 2)[0]
	s = strings.SplitN(s, "?", 2)[0]
	if !usernameRe.MatchString(s) {
		return ""
	}
	return s
}
