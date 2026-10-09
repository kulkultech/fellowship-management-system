package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kulkul/backend/internal/model"
)

var (
	ErrGitHubRepoNotFound = errors.New("github repository not found")
	ErrGitHubRepoExists   = errors.New("github repository already tracked for this program")
)

type GitHubRepository struct {
	pool     *pgxpool.Pool
	mu       sync.RWMutex
	memRepos map[uuid.UUID]*model.ProgramGitHubRepo
}

func NewGitHubRepository(pool *pgxpool.Pool) *GitHubRepository {
	return &GitHubRepository{
		pool:     pool,
		memRepos: make(map[uuid.UUID]*model.ProgramGitHubRepo),
	}
}

const githubRepoColumns = `id, program_id, owner, name, full_name, html_url, added_by,
	sync_status, sync_error, sync_truncated, sync_started_at, last_synced_at,
	contributions, created_at, updated_at`

func scanGitHubRepo(row pgx.Row) (*model.ProgramGitHubRepo, error) {
	var repo model.ProgramGitHubRepo
	var contributions []byte
	err := row.Scan(
		&repo.ID, &repo.ProgramID, &repo.Owner, &repo.Name, &repo.FullName, &repo.HTMLURL, &repo.AddedBy,
		&repo.SyncStatus, &repo.SyncError, &repo.SyncTruncated, &repo.SyncStartedAt, &repo.LastSyncedAt,
		&contributions, &repo.CreatedAt, &repo.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(contributions) > 0 {
		_ = json.Unmarshal(contributions, &repo.Contributions)
	}
	return &repo, nil
}

func copyGitHubRepo(repo *model.ProgramGitHubRepo) *model.ProgramGitHubRepo {
	copied := *repo
	copied.Contributions = make(map[string]model.GitHubContributionCounts, len(repo.Contributions))
	for k, v := range repo.Contributions {
		copied.Contributions[k] = v
	}
	return &copied
}

func (r *GitHubRepository) ListByProgram(ctx context.Context, programID uuid.UUID) ([]*model.ProgramGitHubRepo, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		list := []*model.ProgramGitHubRepo{}
		for _, repo := range r.memRepos {
			if repo.ProgramID == programID {
				list = append(list, copyGitHubRepo(repo))
			}
		}
		sort.Slice(list, func(i, j int) bool { return list[i].CreatedAt.Before(list[j].CreatedAt) })
		return list, nil
	}

	rows, err := r.pool.Query(ctx, `SELECT `+githubRepoColumns+` FROM program_github_repos WHERE program_id = $1 ORDER BY created_at ASC`, programID)
	if err != nil {
		return nil, fmt.Errorf("github_repo: list by program: %w", err)
	}
	defer rows.Close()

	list := []*model.ProgramGitHubRepo{}
	for rows.Next() {
		repo, err := scanGitHubRepo(rows)
		if err != nil {
			return nil, fmt.Errorf("github_repo: scan: %w", err)
		}
		list = append(list, repo)
	}
	return list, rows.Err()
}

func (r *GitHubRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ProgramGitHubRepo, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		repo, ok := r.memRepos[id]
		if !ok {
			return nil, ErrGitHubRepoNotFound
		}
		return copyGitHubRepo(repo), nil
	}

	repo, err := scanGitHubRepo(r.pool.QueryRow(ctx, `SELECT `+githubRepoColumns+` FROM program_github_repos WHERE id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrGitHubRepoNotFound
		}
		return nil, fmt.Errorf("github_repo: get: %w", err)
	}
	return repo, nil
}

func (r *GitHubRepository) Create(ctx context.Context, repo *model.ProgramGitHubRepo) (*model.ProgramGitHubRepo, error) {
	if repo.ID == uuid.Nil {
		repo.ID = uuid.New()
	}
	now := time.Now()
	repo.CreatedAt = now
	repo.UpdatedAt = now
	if repo.SyncStatus == "" {
		repo.SyncStatus = model.GitHubSyncIdle
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, existing := range r.memRepos {
			if existing.ProgramID == repo.ProgramID && strings.EqualFold(existing.FullName, repo.FullName) {
				return nil, ErrGitHubRepoExists
			}
		}
		r.memRepos[repo.ID] = copyGitHubRepo(repo)
		return copyGitHubRepo(repo), nil
	}

	created, err := scanGitHubRepo(r.pool.QueryRow(ctx, `
		INSERT INTO program_github_repos (id, program_id, owner, name, full_name, html_url, added_by, sync_status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+githubRepoColumns,
		repo.ID, repo.ProgramID, repo.Owner, repo.Name, repo.FullName, repo.HTMLURL, repo.AddedBy, repo.SyncStatus, repo.CreatedAt, repo.UpdatedAt,
	))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrGitHubRepoExists
		}
		return nil, fmt.Errorf("github_repo: create: %w", err)
	}
	return created, nil
}

func (r *GitHubRepository) Delete(ctx context.Context, programID, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		repo, ok := r.memRepos[id]
		if !ok || repo.ProgramID != programID {
			return ErrGitHubRepoNotFound
		}
		delete(r.memRepos, id)
		return nil
	}

	tag, err := r.pool.Exec(ctx, `DELETE FROM program_github_repos WHERE id = $1 AND program_id = $2`, id, programID)
	if err != nil {
		return fmt.Errorf("github_repo: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrGitHubRepoNotFound
	}
	return nil
}

// ListDueForSync returns repositories (across all programs) not synced or attempted since the cutoff.
func (r *GitHubRepository) ListDueForSync(ctx context.Context, olderThan time.Duration, limit int) ([]*model.ProgramGitHubRepo, error) {
	cutoff := time.Now().Add(-olderThan)
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		list := []*model.ProgramGitHubRepo{}
		for _, repo := range r.memRepos {
			if repo.SyncStatus != model.GitHubSyncSyncing && repo.UpdatedAt.Before(cutoff) {
				list = append(list, copyGitHubRepo(repo))
			}
		}
		sort.Slice(list, func(i, j int) bool { return list[i].UpdatedAt.Before(list[j].UpdatedAt) })
		if len(list) > limit {
			list = list[:limit]
		}
		return list, nil
	}

	// updated_at changes on every sync attempt, so failing repositories are retried at the same pace
	rows, err := r.pool.Query(ctx, `SELECT `+githubRepoColumns+` FROM program_github_repos
		WHERE sync_status <> 'syncing' AND updated_at < $1
		ORDER BY updated_at ASC LIMIT $2`, cutoff, limit)
	if err != nil {
		return nil, fmt.Errorf("github_repo: list due for sync: %w", err)
	}
	defer rows.Close()

	list := []*model.ProgramGitHubRepo{}
	for rows.Next() {
		repo, err := scanGitHubRepo(rows)
		if err != nil {
			return nil, fmt.Errorf("github_repo: scan: %w", err)
		}
		list = append(list, repo)
	}
	return list, rows.Err()
}

// TryStartSync marks a repository as syncing unless a sync started within staleAfter is still running.
// It returns false when another sync is already in progress.
func (r *GitHubRepository) TryStartSync(ctx context.Context, id uuid.UUID, staleAfter time.Duration) (bool, error) {
	now := time.Now()
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		repo, ok := r.memRepos[id]
		if !ok {
			return false, ErrGitHubRepoNotFound
		}
		if repo.SyncStatus == model.GitHubSyncSyncing && repo.SyncStartedAt != nil && now.Sub(*repo.SyncStartedAt) < staleAfter {
			return false, nil
		}
		repo.SyncStatus = model.GitHubSyncSyncing
		repo.SyncStartedAt = &now
		repo.UpdatedAt = now
		return true, nil
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE program_github_repos
		SET sync_status = 'syncing', sync_started_at = $2, updated_at = $2
		WHERE id = $1
		  AND (sync_status <> 'syncing' OR sync_started_at IS NULL OR sync_started_at < $3)`,
		id, now, now.Add(-staleAfter))
	if err != nil {
		return false, fmt.Errorf("github_repo: start sync: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// FinishSync records a sync result. On failure the previous contributions are kept.
func (r *GitHubRepository) FinishSync(ctx context.Context, id uuid.UUID, contributions map[string]model.GitHubContributionCounts, truncated bool, syncErr error) error {
	now := time.Now()
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		repo, ok := r.memRepos[id]
		if !ok {
			return ErrGitHubRepoNotFound
		}
		repo.UpdatedAt = now
		if syncErr != nil {
			repo.SyncStatus = model.GitHubSyncError
			repo.SyncError = syncErr.Error()
			return nil
		}
		repo.SyncStatus = model.GitHubSyncSuccess
		repo.SyncError = ""
		repo.SyncTruncated = truncated
		repo.LastSyncedAt = &now
		repo.Contributions = contributions
		return nil
	}

	if syncErr != nil {
		_, err := r.pool.Exec(ctx, `
			UPDATE program_github_repos SET sync_status = 'error', sync_error = $2, updated_at = $3 WHERE id = $1`,
			id, syncErr.Error(), now)
		if err != nil {
			return fmt.Errorf("github_repo: record sync error: %w", err)
		}
		return nil
	}

	contributionsJSON, err := json.Marshal(contributions)
	if err != nil {
		return fmt.Errorf("github_repo: encode contributions: %w", err)
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE program_github_repos
		SET sync_status = 'success', sync_error = '', sync_truncated = $2, last_synced_at = $3,
		    contributions = $4, updated_at = $3
		WHERE id = $1`,
		id, truncated, now, contributionsJSON)
	if err != nil {
		return fmt.Errorf("github_repo: record sync result: %w", err)
	}
	return nil
}
