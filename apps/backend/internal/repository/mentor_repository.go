package repository

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kulkul/backend/internal/model"
)

var (
	ErrMentorNotFound      = errors.New("mentor assignment not found")
	ErrMentorAlreadyExists = errors.New("mentor is already assigned to this program")
)

type MentorRepository struct {
	pool       *pgxpool.Pool
	mu         sync.RWMutex
	memMentors map[string]*model.ProgramMentor // key: "programID:userID"
}

func NewMentorRepository(pool *pgxpool.Pool) *MentorRepository {
	return &MentorRepository{
		pool:       pool,
		memMentors: make(map[string]*model.ProgramMentor),
	}
}

func (r *MentorRepository) AssignMentor(ctx context.Context, programID, userID uuid.UUID, roleTitle, bio string) (*model.ProgramMentor, error) {
	if roleTitle == "" {
		roleTitle = "Mentor"
	}
	now := time.Now()

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		key := programID.String() + ":" + userID.String()
		pm := &model.ProgramMentor{
			ID:         uuid.New(),
			ProgramID:  programID,
			UserID:     userID,
			RoleTitle:  roleTitle,
			Bio:        bio,
			AssignedAt: now,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		r.memMentors[key] = pm
		return pm, nil
	}

	query := `
		INSERT INTO program_mentors (id, program_id, user_id, role_title, bio, assigned_at, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, $5)
		ON CONFLICT (program_id, user_id) 
		DO UPDATE SET role_title = EXCLUDED.role_title, bio = EXCLUDED.bio, updated_at = now()
		RETURNING id, program_id, user_id, role_title, bio, assigned_at, created_at, updated_at
	`
	var pm model.ProgramMentor
	err := r.pool.QueryRow(ctx, query, programID, userID, roleTitle, bio, now).Scan(
		&pm.ID, &pm.ProgramID, &pm.UserID, &pm.RoleTitle, &pm.Bio, &pm.AssignedAt, &pm.CreatedAt, &pm.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &pm, nil
}

func (r *MentorRepository) RemoveMentor(ctx context.Context, programID, userID uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		delete(r.memMentors, programID.String()+":"+userID.String())
		return nil
	}

	query := `DELETE FROM program_mentors WHERE program_id = $1 AND user_id = $2`
	_, err := r.pool.Exec(ctx, query, programID, userID)
	return err
}

func (r *MentorRepository) ListMentorsByProgram(ctx context.Context, programID uuid.UUID) ([]*model.ProgramMentor, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var res []*model.ProgramMentor
		for _, pm := range r.memMentors {
			if pm.ProgramID == programID {
				res = append(res, pm)
			}
		}
		return res, nil
	}

	query := `
		SELECT 
			pm.id, pm.program_id, pm.user_id, pm.role_title, pm.bio, pm.assigned_at, pm.created_at, pm.updated_at,
			COALESCE(u.name, '') AS user_name,
			COALESCE(u.email, '') AS user_email,
			COALESCE(u.avatar_url, '') AS user_avatar,
			COALESCE(p.name, '') AS program_name,
			COALESCE(p.slug, '') AS program_slug
		FROM program_mentors pm
		JOIN users u ON u.id = pm.user_id
		JOIN programs p ON p.id = pm.program_id
		WHERE pm.program_id = $1
		ORDER BY pm.assigned_at ASC
	`
	rows, err := r.pool.Query(ctx, query, programID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mentors []*model.ProgramMentor
	for rows.Next() {
		var pm model.ProgramMentor
		err := rows.Scan(
			&pm.ID, &pm.ProgramID, &pm.UserID, &pm.RoleTitle, &pm.Bio, &pm.AssignedAt, &pm.CreatedAt, &pm.UpdatedAt,
			&pm.UserName, &pm.UserEmail, &pm.UserAvatar, &pm.ProgramName, &pm.ProgramSlug,
		)
		if err != nil {
			return nil, err
		}
		mentors = append(mentors, &pm)
	}
	if mentors == nil {
		mentors = []*model.ProgramMentor{}
	}
	return mentors, nil
}

func (r *MentorRepository) ListProgramsByMentor(ctx context.Context, userID uuid.UUID) ([]*model.MentorProgramSummary, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var res []*model.MentorProgramSummary
		for _, pm := range r.memMentors {
			if pm.UserID == userID {
				res = append(res, &model.MentorProgramSummary{
					ProgramID:   pm.ProgramID,
					ProgramName: "Fellowship Cohort",
					RoleTitle:   pm.RoleTitle,
				})
			}
		}
		return res, nil
	}

	query := `
		SELECT 
			p.id, p.slug, p.name, COALESCE(p.description, ''), COALESCE(p.image_url, ''),
			p.organization_id, o.slug AS org_slug, o.name AS org_name,
			pm.role_title,
			p.open_date, p.end_date,
			(SELECT COUNT(*) FROM applicants a WHERE a.program_id = p.id AND a.deleted_at IS NULL) AS fellow_count,
			(SELECT COUNT(*) FROM program_tracks t WHERE t.program_id = p.id) AS track_count
		FROM program_mentors pm
		JOIN programs p ON p.id = pm.program_id
		JOIN organizations o ON o.id = p.organization_id
		WHERE pm.user_id = $1
		ORDER BY p.open_date DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []*model.MentorProgramSummary
	for rows.Next() {
		var s model.MentorProgramSummary
		err := rows.Scan(
			&s.ProgramID, &s.ProgramSlug, &s.ProgramName, &s.Description, &s.ImageURL,
			&s.OrganizationID, &s.OrgSlug, &s.OrgName,
			&s.RoleTitle,
			&s.OpenDate, &s.EndDate,
			&s.FellowCount, &s.TrackCount,
		)
		if err != nil {
			return nil, err
		}
		summaries = append(summaries, &s)
	}
	if summaries == nil {
		summaries = []*model.MentorProgramSummary{}
	}
	return summaries, nil
}

func (r *MentorRepository) IsMentorOfProgram(ctx context.Context, userID, programID uuid.UUID) (bool, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		_, ok := r.memMentors[programID.String()+":"+userID.String()]
		return ok, nil
	}

	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM program_mentors WHERE program_id = $1 AND user_id = $2)`
	err := r.pool.QueryRow(ctx, query, programID, userID).Scan(&exists)
	return exists, err
}

func (r *MentorRepository) GetOverview(ctx context.Context, user *model.User) (*model.MentorOverview, error) {
	programs, err := r.ListProgramsByMentor(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	totalFellows := 0
	for _, p := range programs {
		totalFellows += p.FellowCount
	}

	return &model.MentorOverview{
		MentorID:         user.ID,
		Name:             user.Name,
		Email:            user.Email,
		AvatarURL:        user.AvatarURL,
		AssignedPrograms: programs,
		TotalFellows:     totalFellows,
		ActiveSessions:   0,
	}, nil
}
