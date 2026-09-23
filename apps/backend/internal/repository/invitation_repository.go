package repository

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kulkul/backend/internal/model"
)

var (
	ErrInvitationNotFound = errors.New("invitation not found")
	ErrInvitationExpired  = errors.New("invitation has expired")
	ErrInvitationUsed     = errors.New("invitation has already been accepted or revoked")
)

type InvitationRepository struct {
	pool          *pgxpool.Pool
	mu            sync.RWMutex
	memInvites    map[uuid.UUID]*model.Invitation
	memByToken    map[string]*model.Invitation
}

func NewInvitationRepository(pool *pgxpool.Pool) *InvitationRepository {
	return &InvitationRepository{
		pool:       pool,
		memInvites: make(map[uuid.UUID]*model.Invitation),
		memByToken: make(map[string]*model.Invitation),
	}
}

func (r *InvitationRepository) Create(ctx context.Context, inv *model.Invitation) (*model.Invitation, error) {
	if inv.ID == uuid.Nil {
		inv.ID = uuid.New()
	}
	inv.Email = strings.TrimSpace(strings.ToLower(inv.Email))
	if inv.Status == "" {
		inv.Status = model.InvitationStatusPending
	}
	if inv.CreatedAt.IsZero() {
		inv.CreatedAt = time.Now()
	}
	inv.UpdatedAt = inv.CreatedAt

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		// Revoke previous pending invites for same email and org
		for _, existing := range r.memInvites {
			if strings.EqualFold(existing.Email, inv.Email) && existing.Status == model.InvitationStatusPending {
				if (inv.OrganizationID == nil && existing.OrganizationID == nil) ||
					(inv.OrganizationID != nil && existing.OrganizationID != nil && *inv.OrganizationID == *existing.OrganizationID) {
					existing.Status = model.InvitationStatusRevoked
					existing.UpdatedAt = time.Now()
				}
			}
		}
		r.memInvites[inv.ID] = inv
		r.memByToken[inv.Token] = inv
		return inv, nil
	}

	// Revoke any previous pending invitations for this email and organization/superadmin
	revokeQuery := `
		UPDATE invitations 
		SET status = 'revoked', updated_at = now() 
		WHERE LOWER(email) = LOWER($1) AND status = 'pending' AND (
			($2::uuid IS NULL AND organization_id IS NULL) OR 
			($2::uuid IS NOT NULL AND organization_id = $2::uuid)
		)
	`
	_, _ = r.pool.Exec(ctx, revokeQuery, inv.Email, inv.OrganizationID)

	query := `
		INSERT INTO invitations (id, email, role, organization_id, program_id, token, invited_by, status, expires_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, email, role, organization_id, program_id, token, invited_by, status, expires_at, created_at, updated_at
	`
	var res model.Invitation
	err := r.pool.QueryRow(ctx, query,
		inv.ID, inv.Email, inv.Role, inv.OrganizationID, inv.ProgramID, inv.Token, inv.InvitedBy, inv.Status, inv.ExpiresAt, inv.CreatedAt, inv.UpdatedAt,
	).Scan(
		&res.ID, &res.Email, &res.Role, &res.OrganizationID, &res.ProgramID, &res.Token, &res.InvitedBy, &res.Status, &res.ExpiresAt, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func (r *InvitationRepository) GetByToken(ctx context.Context, token string) (*model.Invitation, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrInvitationNotFound
	}

	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		inv, ok := r.memByToken[token]
		if !ok {
			return nil, ErrInvitationNotFound
		}
		return inv, nil
	}

	query := `
		SELECT 
			i.id, i.email, i.role, i.organization_id, i.program_id, i.token, i.invited_by, i.status, i.expires_at, i.created_at, i.updated_at,
			COALESCE(u.name, '') AS invited_by_name,
			COALESCE(o.name, '') AS organization_name,
			COALESCE(o.slug, '') AS organization_slug,
			COALESCE(o.logo_url, '') AS organization_logo,
			COALESCE(p.name, '') AS program_name,
			COALESCE(p.slug, '') AS program_slug
		FROM invitations i
		LEFT JOIN users u ON u.id = i.invited_by
		LEFT JOIN organizations o ON o.id = i.organization_id
		LEFT JOIN programs p ON p.id = i.program_id
		WHERE i.token = $1
	`
	var inv model.Invitation
	err := r.pool.QueryRow(ctx, query, token).Scan(
		&inv.ID, &inv.Email, &inv.Role, &inv.OrganizationID, &inv.ProgramID, &inv.Token, &inv.InvitedBy, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt,
		&inv.InvitedByName, &inv.OrganizationName, &inv.OrganizationSlug, &inv.OrganizationLogo,
		&inv.ProgramName, &inv.ProgramSlug,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvitationNotFound
		}
		return nil, err
	}
	return &inv, nil
}

func (r *InvitationRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Invitation, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		inv, ok := r.memInvites[id]
		if !ok {
			return nil, ErrInvitationNotFound
		}
		return inv, nil
	}

	query := `
		SELECT 
			i.id, i.email, i.role, i.organization_id, i.program_id, i.token, i.invited_by, i.status, i.expires_at, i.created_at, i.updated_at,
			COALESCE(u.name, '') AS invited_by_name,
			COALESCE(o.name, '') AS organization_name,
			COALESCE(o.slug, '') AS organization_slug,
			COALESCE(o.logo_url, '') AS organization_logo,
			COALESCE(p.name, '') AS program_name,
			COALESCE(p.slug, '') AS program_slug
		FROM invitations i
		LEFT JOIN users u ON u.id = i.invited_by
		LEFT JOIN organizations o ON o.id = i.organization_id
		LEFT JOIN programs p ON p.id = i.program_id
		WHERE i.id = $1
	`
	var inv model.Invitation
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&inv.ID, &inv.Email, &inv.Role, &inv.OrganizationID, &inv.ProgramID, &inv.Token, &inv.InvitedBy, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt,
		&inv.InvitedByName, &inv.OrganizationName, &inv.OrganizationSlug, &inv.OrganizationLogo,
		&inv.ProgramName, &inv.ProgramSlug,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvitationNotFound
		}
		return nil, err
	}
	return &inv, nil
}

func (r *InvitationRepository) ListByOrganization(ctx context.Context, orgID uuid.UUID) ([]*model.Invitation, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var res []*model.Invitation
		for _, inv := range r.memInvites {
			if inv.OrganizationID != nil && *inv.OrganizationID == orgID {
				res = append(res, inv)
			}
		}
		return res, nil
	}

	query := `
		SELECT 
			i.id, i.email, i.role, i.organization_id, i.program_id, i.token, i.invited_by, i.status, i.expires_at, i.created_at, i.updated_at,
			COALESCE(u.name, '') AS invited_by_name,
			COALESCE(o.name, '') AS organization_name,
			COALESCE(o.slug, '') AS organization_slug,
			COALESCE(o.logo_url, '') AS organization_logo,
			COALESCE(p.name, '') AS program_name,
			COALESCE(p.slug, '') AS program_slug
		FROM invitations i
		LEFT JOIN users u ON u.id = i.invited_by
		LEFT JOIN organizations o ON o.id = i.organization_id
		LEFT JOIN programs p ON p.id = i.program_id
		WHERE i.organization_id = $1
		ORDER BY i.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var res []*model.Invitation
	for rows.Next() {
		var inv model.Invitation
		err := rows.Scan(
			&inv.ID, &inv.Email, &inv.Role, &inv.OrganizationID, &inv.ProgramID, &inv.Token, &inv.InvitedBy, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt,
			&inv.InvitedByName, &inv.OrganizationName, &inv.OrganizationSlug, &inv.OrganizationLogo,
			&inv.ProgramName, &inv.ProgramSlug,
		)
		if err != nil {
			return nil, err
		}
		res = append(res, &inv)
	}
	return res, nil
}

func (r *InvitationRepository) ListSuperadminInvitations(ctx context.Context) ([]*model.Invitation, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var res []*model.Invitation
		for _, inv := range r.memInvites {
			if inv.Role == model.RoleSuperadmin {
				res = append(res, inv)
			}
		}
		return res, nil
	}

	query := `
		SELECT 
			i.id, i.email, i.role, i.organization_id, i.token, i.invited_by, i.status, i.expires_at, i.created_at, i.updated_at,
			COALESCE(u.name, '') AS invited_by_name,
			COALESCE(o.name, '') AS organization_name,
			COALESCE(o.slug, '') AS organization_slug,
			COALESCE(o.logo_url, '') AS organization_logo
		FROM invitations i
		LEFT JOIN users u ON u.id = i.invited_by
		LEFT JOIN organizations o ON o.id = i.organization_id
		WHERE i.role = 'superadmin'
		ORDER BY i.created_at DESC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var res []*model.Invitation
	for rows.Next() {
		var inv model.Invitation
		err := rows.Scan(
			&inv.ID, &inv.Email, &inv.Role, &inv.OrganizationID, &inv.Token, &inv.InvitedBy, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt,
			&inv.InvitedByName, &inv.OrganizationName, &inv.OrganizationSlug, &inv.OrganizationLogo,
		)
		if err != nil {
			return nil, err
		}
		res = append(res, &inv)
	}
	return res, nil
}

func (r *InvitationRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		inv, ok := r.memInvites[id]
		if !ok {
			return ErrInvitationNotFound
		}
		inv.Status = status
		inv.UpdatedAt = time.Now()
		return nil
	}

	query := `UPDATE invitations SET status = $1, updated_at = now() WHERE id = $2`
	tag, err := r.pool.Exec(ctx, query, status, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvitationNotFound
	}
	return nil
}

func (r *InvitationRepository) RefreshExpiration(ctx context.Context, id uuid.UUID, newExpiresAt time.Time) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		inv, ok := r.memInvites[id]
		if !ok {
			return ErrInvitationNotFound
		}
		inv.ExpiresAt = newExpiresAt
		inv.Status = model.InvitationStatusPending
		inv.UpdatedAt = time.Now()
		return nil
	}

	query := `UPDATE invitations SET expires_at = $1, status = 'pending', updated_at = now() WHERE id = $2`
	tag, err := r.pool.Exec(ctx, query, newExpiresAt, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvitationNotFound
	}
	return nil
}

func (r *InvitationRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		inv, ok := r.memInvites[id]
		if !ok {
			return ErrInvitationNotFound
		}
		delete(r.memByToken, inv.Token)
		delete(r.memInvites, id)
		return nil
	}

	query := `DELETE FROM invitations WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvitationNotFound
	}
	return nil
}
