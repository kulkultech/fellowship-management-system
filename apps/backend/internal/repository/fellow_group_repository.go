package repository

import (
	"context"
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
	ErrFellowGroupNotFound   = errors.New("fellow group not found")
	ErrFellowGroupNameExists = errors.New("a fellow group with this name already exists in this program")
)

type FellowGroupRepository struct {
	pool      *pgxpool.Pool
	mu        sync.RWMutex
	memGroups map[uuid.UUID]*model.FellowGroup
}

func NewFellowGroupRepository(pool *pgxpool.Pool) *FellowGroupRepository {
	return &FellowGroupRepository{pool: pool, memGroups: make(map[uuid.UUID]*model.FellowGroup)}
}

func copyFellowGroup(g *model.FellowGroup) *model.FellowGroup {
	c := *g
	c.MemberIDs = append([]uuid.UUID{}, g.MemberIDs...)
	return &c
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// ListByProgram returns the program's groups (sorted by name) with their current members.
func (r *FellowGroupRepository) ListByProgram(ctx context.Context, programID uuid.UUID) ([]*model.FellowGroup, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []*model.FellowGroup
		for _, g := range r.memGroups {
			if g.ProgramID == programID {
				list = append(list, copyFellowGroup(g))
			}
		}
		sort.Slice(list, func(i, j int) bool { return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name) })
		return list, nil
	}

	query := `
		SELECT g.id, g.program_id, g.name, g.created_by, g.created_at, g.updated_at,
			COALESCE(
				array_agg(m.applicant_id ORDER BY a.full_name) FILTER (WHERE a.id IS NOT NULL AND a.deleted_at IS NULL),
				'{}'
			) AS member_ids
		FROM fellow_groups g
		LEFT JOIN fellow_group_members m ON m.group_id = g.id
		LEFT JOIN applicants a ON a.id = m.applicant_id
		WHERE g.program_id = $1
		GROUP BY g.id
		ORDER BY LOWER(g.name)
	`
	rows, err := r.pool.Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("fellow_group_repo: list: %w", err)
	}
	defer rows.Close()

	var list []*model.FellowGroup
	for rows.Next() {
		var g model.FellowGroup
		if err := rows.Scan(&g.ID, &g.ProgramID, &g.Name, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.MemberIDs); err != nil {
			return nil, fmt.Errorf("fellow_group_repo: scan: %w", err)
		}
		list = append(list, &g)
	}
	return list, rows.Err()
}

// GetByID returns one group with its members.
func (r *FellowGroupRepository) GetByID(ctx context.Context, programID, groupID uuid.UUID) (*model.FellowGroup, error) {
	groups, err := r.ListByProgram(ctx, programID)
	if err != nil {
		return nil, err
	}
	for _, g := range groups {
		if g.ID == groupID {
			return g, nil
		}
	}
	return nil, ErrFellowGroupNotFound
}

// Create inserts a group and its members.
func (r *FellowGroupRepository) Create(ctx context.Context, g *model.FellowGroup) (*model.FellowGroup, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, existing := range r.memGroups {
			if existing.ProgramID == g.ProgramID && strings.EqualFold(existing.Name, g.Name) {
				return nil, ErrFellowGroupNameExists
			}
		}
		c := copyFellowGroup(g)
		c.ID = uuid.New()
		c.CreatedAt = time.Now()
		c.UpdatedAt = c.CreatedAt
		r.memGroups[c.ID] = c
		return copyFellowGroup(c), nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("fellow_group_repo: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	err = tx.QueryRow(ctx,
		`INSERT INTO fellow_groups (program_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
		g.ProgramID, g.Name, g.CreatedBy,
	).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrFellowGroupNameExists
		}
		return nil, fmt.Errorf("fellow_group_repo: create: %w", err)
	}
	if err := insertFellowGroupMembers(ctx, tx, id, g.MemberIDs); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("fellow_group_repo: commit: %w", err)
	}
	return r.GetByID(ctx, g.ProgramID, id)
}

// Update renames a group and replaces its members.
func (r *FellowGroupRepository) Update(ctx context.Context, programID, groupID uuid.UUID, name string, memberIDs []uuid.UUID) (*model.FellowGroup, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		g, ok := r.memGroups[groupID]
		if !ok || g.ProgramID != programID {
			return nil, ErrFellowGroupNotFound
		}
		for _, existing := range r.memGroups {
			if existing.ID != groupID && existing.ProgramID == programID && strings.EqualFold(existing.Name, name) {
				return nil, ErrFellowGroupNameExists
			}
		}
		g.Name = name
		g.MemberIDs = append([]uuid.UUID{}, memberIDs...)
		g.UpdatedAt = time.Now()
		return copyFellowGroup(g), nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("fellow_group_repo: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE fellow_groups SET name = $3, updated_at = now() WHERE id = $1 AND program_id = $2`,
		groupID, programID, name,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrFellowGroupNameExists
		}
		return nil, fmt.Errorf("fellow_group_repo: update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrFellowGroupNotFound
	}
	if _, err := tx.Exec(ctx, `DELETE FROM fellow_group_members WHERE group_id = $1`, groupID); err != nil {
		return nil, fmt.Errorf("fellow_group_repo: clear members: %w", err)
	}
	if err := insertFellowGroupMembers(ctx, tx, groupID, memberIDs); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("fellow_group_repo: commit: %w", err)
	}
	return r.GetByID(ctx, programID, groupID)
}

// Delete removes a group. Sessions and assignments keep their targeted fellows.
func (r *FellowGroupRepository) Delete(ctx context.Context, programID, groupID uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		g, ok := r.memGroups[groupID]
		if !ok || g.ProgramID != programID {
			return ErrFellowGroupNotFound
		}
		delete(r.memGroups, groupID)
		return nil
	}
	tag, err := r.pool.Exec(ctx, `DELETE FROM fellow_groups WHERE id = $1 AND program_id = $2`, groupID, programID)
	if err != nil {
		return fmt.Errorf("fellow_group_repo: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrFellowGroupNotFound
	}
	return nil
}

func insertFellowGroupMembers(ctx context.Context, tx pgx.Tx, groupID uuid.UUID, memberIDs []uuid.UUID) error {
	for _, applicantID := range memberIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO fellow_group_members (group_id, applicant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			groupID, applicantID,
		); err != nil {
			return fmt.Errorf("fellow_group_repo: add member: %w", err)
		}
	}
	return nil
}
