package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kulkul/backend/internal/model"
)

// RoomContentRepository stores each program room's curriculum and resources.
type RoomContentRepository struct {
	pool *pgxpool.Pool
	mu   sync.RWMutex
	mem  map[uuid.UUID]*model.ProgramRoomContent
}

func NewRoomContentRepository(pool *pgxpool.Pool) *RoomContentRepository {
	return &RoomContentRepository{pool: pool, mem: make(map[uuid.UUID]*model.ProgramRoomContent)}
}

func emptyRoomContent(programID uuid.UUID) *model.ProgramRoomContent {
	return &model.ProgramRoomContent{
		ProgramID:  programID,
		Curriculum: []model.CurriculumItem{},
		Resources:  []model.RoomResource{},
	}
}

// Get returns the room content for a program (empty lists when nothing has been saved yet).
func (r *RoomContentRepository) Get(ctx context.Context, programID uuid.UUID) (*model.ProgramRoomContent, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		if c, ok := r.mem[programID]; ok {
			cp := *c
			cp.Curriculum = append([]model.CurriculumItem{}, c.Curriculum...)
			cp.Resources = append([]model.RoomResource{}, c.Resources...)
			return &cp, nil
		}
		return emptyRoomContent(programID), nil
	}

	var rawCurriculum, rawResources []byte
	var updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT curriculum, resources, updated_at FROM program_room_content WHERE program_id = $1`,
		programID,
	).Scan(&rawCurriculum, &rawResources, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return emptyRoomContent(programID), nil
	}
	if err != nil {
		return nil, fmt.Errorf("room_content_repo: get: %w", err)
	}
	content := emptyRoomContent(programID)
	content.UpdatedAt = &updatedAt
	_ = json.Unmarshal(rawCurriculum, &content.Curriculum)
	_ = json.Unmarshal(rawResources, &content.Resources)
	if content.Curriculum == nil {
		content.Curriculum = []model.CurriculumItem{}
	}
	if content.Resources == nil {
		content.Resources = []model.RoomResource{}
	}
	return content, nil
}

// SaveCurriculum replaces the program's curriculum list.
func (r *RoomContentRepository) SaveCurriculum(ctx context.Context, programID, updatedBy uuid.UUID, items []model.CurriculumItem) (*model.ProgramRoomContent, error) {
	return r.save(ctx, programID, updatedBy, "curriculum", items)
}

// SaveResources replaces the program's resource list.
func (r *RoomContentRepository) SaveResources(ctx context.Context, programID, updatedBy uuid.UUID, items []model.RoomResource) (*model.ProgramRoomContent, error) {
	return r.save(ctx, programID, updatedBy, "resources", items)
}

func (r *RoomContentRepository) save(ctx context.Context, programID, updatedBy uuid.UUID, column string, items any) (*model.ProgramRoomContent, error) {
	if r.pool == nil {
		r.mu.Lock()
		c, ok := r.mem[programID]
		if !ok {
			c = emptyRoomContent(programID)
			r.mem[programID] = c
		}
		now := time.Now()
		c.UpdatedAt = &now
		switch v := items.(type) {
		case []model.CurriculumItem:
			c.Curriculum = append([]model.CurriculumItem{}, v...)
		case []model.RoomResource:
			c.Resources = append([]model.RoomResource{}, v...)
		}
		r.mu.Unlock()
		return r.Get(ctx, programID)
	}

	raw, err := json.Marshal(items)
	if err != nil {
		return nil, fmt.Errorf("room_content_repo: encode %s: %w", column, err)
	}
	// column is one of two fixed names chosen above, never user input
	query := fmt.Sprintf(`
		INSERT INTO program_room_content (program_id, %[1]s, updated_by, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (program_id) DO UPDATE SET %[1]s = EXCLUDED.%[1]s, updated_by = EXCLUDED.updated_by, updated_at = now()
	`, column)
	if _, err := r.pool.Exec(ctx, query, programID, raw, updatedBy); err != nil {
		return nil, fmt.Errorf("room_content_repo: save %s: %w", column, err)
	}
	return r.Get(ctx, programID)
}
