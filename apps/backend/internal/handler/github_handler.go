package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/github"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

const (
	githubSyncTimeout    = 10 * time.Minute
	githubSyncStaleAfter = 15 * time.Minute
	githubAutoSyncAfter  = 24 * time.Hour
	maxReposPerProgram   = 20
)

type GitHubHandler struct {
	githubRepo    *repository.GitHubRepository
	programRepo   *repository.ProgramRepository
	applicantRepo *repository.ApplicantRepository
	mentorRepo    *repository.MentorRepository
	client        *github.Client

	// runAsync launches background syncs; tests replace it to run synchronously.
	runAsync func(func())
	// autoSyncAfter is how long a repository goes unsynced before the scheduler refreshes it.
	autoSyncAfter time.Duration
}

func NewGitHubHandler(
	githubRepo *repository.GitHubRepository,
	programRepo *repository.ProgramRepository,
	applicantRepo *repository.ApplicantRepository,
	mentorRepo *repository.MentorRepository,
	client *github.Client,
) *GitHubHandler {
	return &GitHubHandler{
		githubRepo:    githubRepo,
		programRepo:   programRepo,
		applicantRepo: applicantRepo,
		mentorRepo:    mentorRepo,
		client:        client,
		runAsync:      func(f func()) { go f() },
		autoSyncAfter: githubAutoSyncAfter,
	}
}

// authorizeProgram allows superadmins, org admins/reviewers of the program's organization, and assigned mentors.
func (h *GitHubHandler) authorizeProgram(w http.ResponseWriter, r *http.Request) (*model.Program, bool) {
	programID, err := uuid.Parse(chi.URLParam(r, "programId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return nil, false
	}
	claims, ok := middleware.GetUser(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return nil, false
	}
	program, err := h.programRepo.GetByID(r.Context(), programID)
	if err != nil || program == nil {
		httpx.Error(w, http.StatusNotFound, "program not found")
		return nil, false
	}

	switch claims.Role {
	case model.RoleSuperadmin:
		return program, true
	case model.RoleOrgAdmin, model.RoleReviewer:
		if claims.OrganizationID != nil && *claims.OrganizationID == program.OrganizationID {
			return program, true
		}
	case model.RoleMentor:
		if isMentor, err := h.mentorRepo.IsMentorOfProgram(r.Context(), claims.UserID, programID); err == nil && isMentor {
			return program, true
		}
	}
	httpx.Error(w, http.StatusForbidden, "you do not have access to this program")
	return nil, false
}

// ListRepos handles GET /api/v1/programs/{programId}/github/repos
func (h *GitHubHandler) ListRepos(w http.ResponseWriter, r *http.Request) {
	program, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	repos, err := h.githubRepo.ListByProgram(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list repositories")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"repos": repos})
}

type addGitHubRepoRequest struct {
	RepoURL string `json:"repo_url"`
}

// AddRepo handles POST /api/v1/programs/{programId}/github/repos
func (h *GitHubHandler) AddRepo(w http.ResponseWriter, r *http.Request) {
	program, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	var req addGitHubRepoRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	owner, name, err := github.ParseRepoRef(req.RepoURL)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	existing, err := h.githubRepo.ListByProgram(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list repositories")
		return
	}
	if len(existing) >= maxReposPerProgram {
		httpx.Error(w, http.StatusBadRequest, "a program can track at most 20 repositories")
		return
	}

	// Confirm the repository exists and get its canonical name
	ghRepo, err := h.client.GetRepo(r.Context(), owner, name)
	if err != nil {
		switch {
		case errors.Is(err, github.ErrNotFound):
			msg := "repository not found. Check the URL"
			if !h.client.HasToken() {
				msg += " (private repositories need a GITHUB_TOKEN on the server)"
			}
			httpx.Error(w, http.StatusBadRequest, msg)
		case errors.Is(err, github.ErrRateLimited):
			httpx.Error(w, http.StatusTooManyRequests, "GitHub rate limit reached, try again later")
		default:
			httpx.Error(w, http.StatusBadGateway, "could not reach GitHub, try again later")
		}
		return
	}

	var addedBy *uuid.UUID
	if claims, ok := middleware.GetUser(r.Context()); ok && claims != nil {
		id := claims.UserID
		addedBy = &id
	}
	created, err := h.githubRepo.Create(r.Context(), &model.ProgramGitHubRepo{
		ProgramID: program.ID,
		Owner:     ghRepo.Owner.Login,
		Name:      ghRepo.Name,
		FullName:  ghRepo.FullName,
		HTMLURL:   ghRepo.HTMLURL,
		AddedBy:   addedBy,
	})
	if err != nil {
		if errors.Is(err, repository.ErrGitHubRepoExists) {
			httpx.Error(w, http.StatusConflict, "this repository is already tracked for the program")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to add repository")
		return
	}

	h.startSync(r.Context(), created)
	if refreshed, err := h.githubRepo.GetByID(r.Context(), created.ID); err == nil {
		created = refreshed
	}
	httpx.JSON(w, http.StatusCreated, created)
}

// DeleteRepo handles DELETE /api/v1/programs/{programId}/github/repos/{repoId}
func (h *GitHubHandler) DeleteRepo(w http.ResponseWriter, r *http.Request) {
	program, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	repoID, err := uuid.Parse(chi.URLParam(r, "repoId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid repository id")
		return
	}
	if err := h.githubRepo.Delete(r.Context(), program.ID, repoID); err != nil {
		if errors.Is(err, repository.ErrGitHubRepoNotFound) {
			httpx.Error(w, http.StatusNotFound, "repository not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to remove repository")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SyncRepo handles POST /api/v1/programs/{programId}/github/repos/{repoId}/sync
func (h *GitHubHandler) SyncRepo(w http.ResponseWriter, r *http.Request) {
	program, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	repoID, err := uuid.Parse(chi.URLParam(r, "repoId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid repository id")
		return
	}
	repo, err := h.githubRepo.GetByID(r.Context(), repoID)
	if err != nil || repo.ProgramID != program.ID {
		httpx.Error(w, http.StatusNotFound, "repository not found")
		return
	}

	h.startSync(r.Context(), repo)
	if refreshed, err := h.githubRepo.GetByID(r.Context(), repo.ID); err == nil {
		repo = refreshed
	}
	httpx.JSON(w, http.StatusAccepted, repo)
}

// startSync collects contributions in the background unless a sync is already running.
func (h *GitHubHandler) startSync(ctx context.Context, repo *model.ProgramGitHubRepo) {
	started, err := h.githubRepo.TryStartSync(ctx, repo.ID, githubSyncStaleAfter)
	if err != nil || !started {
		return
	}
	repoCopy := *repo
	h.runAsync(func() { h.collectAndStore(&repoCopy) })
}

// collectAndStore fetches a repository's activity from GitHub and records the result.
// The caller must have claimed the sync with TryStartSync.
func (h *GitHubHandler) collectAndStore(repo *model.ProgramGitHubRepo) {
	syncCtx, cancel := context.WithTimeout(context.Background(), githubSyncTimeout)
	defer cancel()

	activity, err := h.client.CollectRepoActivity(syncCtx, repo.Owner, repo.Name)
	var contributions map[string]model.GitHubContributionCounts
	truncated := false
	if err == nil {
		truncated = activity.Truncated
		contributions = make(map[string]model.GitHubContributionCounts, len(activity.Contributors))
		for login, c := range activity.Contributors {
			contributions[login] = model.GitHubContributionCounts(*c)
		}
	} else {
		err = friendlySyncError(err)
	}
	if finishErr := h.githubRepo.FinishSync(syncCtx, repo.ID, contributions, truncated, err); finishErr != nil {
		slog.Error("github sync: failed to record result", "repo", repo.FullName, "error", finishErr)
	}
}

// RunScheduledSync re-syncs repositories that have not been refreshed for a day, one at a time.
func (h *GitHubHandler) RunScheduledSync(ctx context.Context) {
	// Without a token GitHub allows 60 requests/hour; a small repository needs about 6
	limit := 5
	if h.client.HasToken() {
		limit = 50
	}
	due, err := h.githubRepo.ListDueForSync(ctx, h.autoSyncAfter, limit)
	if err != nil {
		slog.Error("github auto-sync: failed to list repositories", "error", err)
		return
	}
	for _, repo := range due {
		if ctx.Err() != nil {
			return
		}
		started, err := h.githubRepo.TryStartSync(ctx, repo.ID, githubSyncStaleAfter)
		if err != nil || !started {
			continue
		}
		h.collectAndStore(repo)
	}
}

// StartAutoSync runs RunScheduledSync every hour until ctx is cancelled.
func (h *GitHubHandler) StartAutoSync(ctx context.Context) {
	go func() {
		// Short initial delay so startup and migrations finish first
		timer := time.NewTimer(2 * time.Minute)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				h.RunScheduledSync(ctx)
				timer.Reset(time.Hour)
			}
		}
	}()
}

type updateFellowGitHubRequest struct {
	GitHub string `json:"github"`
}

// UpdateFellowGitHub handles PUT /api/v1/programs/{programId}/github/fellows/{applicantId}
func (h *GitHubHandler) UpdateFellowGitHub(w http.ResponseWriter, r *http.Request) {
	program, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	applicantID, err := uuid.Parse(chi.URLParam(r, "applicantId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid applicant id")
		return
	}
	var req updateFellowGitHubRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	applicant, err := h.applicantRepo.GetByID(r.Context(), applicantID)
	if err != nil || applicant == nil || applicant.ProgramID != program.ID || !isProgramFellow(*applicant) {
		httpx.Error(w, http.StatusNotFound, "fellow not found in this program")
		return
	}

	githubURL := ""
	login := ""
	if strings.TrimSpace(req.GitHub) != "" {
		login = github.UsernameFromProfile(req.GitHub)
		if login == "" {
			httpx.Error(w, http.StatusBadRequest, "enter a GitHub username or a github.com profile link")
			return
		}
		githubURL = "https://github.com/" + login
	}
	if err := h.applicantRepo.UpdateGitHubURL(r.Context(), applicant.ID, githubURL); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update GitHub profile")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{
		"github_url":   githubURL,
		"github_login": login,
	})
}

func friendlySyncError(err error) error {
	switch {
	case errors.Is(err, github.ErrNotFound):
		return errors.New("repository not found or no longer accessible")
	case errors.Is(err, github.ErrRateLimited):
		return errors.New(strings.TrimPrefix(err.Error(), "github: "))
	case errors.Is(err, context.DeadlineExceeded):
		return errors.New("sync timed out, the repository may be too large")
	default:
		return errors.New("could not fetch activity from GitHub")
	}
}

// GetActivity handles GET /api/v1/programs/{programId}/github/activity
func (h *GitHubHandler) GetActivity(w http.ResponseWriter, r *http.Request) {
	program, ok := h.authorizeProgram(w, r)
	if !ok {
		return
	}
	repos, err := h.githubRepo.ListByProgram(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list repositories")
		return
	}
	applicants, err := h.applicantRepo.ListByProgram(r.Context(), program.ID, "")
	if err != nil && !errors.Is(err, repository.ErrApplicantNotFound) {
		httpx.Error(w, http.StatusInternalServerError, "failed to list fellows")
		return
	}

	fellows := []*model.GitHubFellowActivity{}
	for _, a := range applicants {
		if !isProgramFellow(a) {
			continue
		}
		activity := &model.GitHubFellowActivity{
			ApplicantID: a.ID,
			FullName:    a.FullName,
			Email:       a.Email,
			GitHubURL:   a.GitHubURL,
			GitHubLogin: github.UsernameFromProfile(a.GitHubURL),
			ByRepo:      map[string]model.GitHubContributionCounts{},
		}
		if activity.GitHubLogin != "" {
			login := strings.ToLower(activity.GitHubLogin)
			for _, repo := range repos {
				if counts, ok := repo.Contributions[login]; ok {
					activity.ByRepo[repo.ID.String()] = counts
					activity.Totals.Add(counts)
				}
			}
		}
		fellows = append(fellows, activity)
	}
	sort.SliceStable(fellows, func(i, j int) bool {
		return strings.ToLower(fellows[i].FullName) < strings.ToLower(fellows[j].FullName)
	})

	httpx.JSON(w, http.StatusOK, map[string]any{
		"repos":                   repos,
		"fellows":                 fellows,
		"github_token_configured": h.client.HasToken(),
	})
}

// isProgramFellow reports whether an applicant was admitted into the program cohort.
func isProgramFellow(a model.Applicant) bool {
	if a.DeletedAt != nil {
		return false
	}
	return a.CurrentStage == model.StageApprovedForLive ||
		a.CurrentStage == model.StageCompleted ||
		a.ProgramRoomInvitedAt != nil
}
