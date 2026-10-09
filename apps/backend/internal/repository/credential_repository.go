package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kulkul/backend/internal/model"
)

var (
	ErrBadgeNotFound       = errors.New("badge not found")
	ErrCertificateNotFound = errors.New("certificate not found")
)

type CredentialRepository struct {
	pool            *pgxpool.Pool
	mu              sync.RWMutex
	memBadges       map[uuid.UUID]*model.Badge
	memCertificates map[uuid.UUID]*model.Certificate
}

func NewCredentialRepository(pool *pgxpool.Pool) *CredentialRepository {
	return &CredentialRepository{
		pool:            pool,
		memBadges:       make(map[uuid.UUID]*model.Badge),
		memCertificates: make(map[uuid.UUID]*model.Certificate),
	}
}

// ---------------------------------------------------------------------
// BADGE REPOSITORY METHODS
// ---------------------------------------------------------------------

func (r *CredentialRepository) AwardBadge(ctx context.Context, b *model.Badge) (*model.Badge, error) {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	now := time.Now()
	if b.IssuedAt.IsZero() {
		b.IssuedAt = now
	}
	b.CreatedAt = now
	b.UpdatedAt = now
	if b.Metadata == nil {
		b.Metadata = make(map[string]interface{})
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()

		// Check if applicant already has this badge type for this program
		for _, existing := range r.memBadges {
			if existing.ApplicantID == b.ApplicantID && existing.BadgeType == b.BadgeType {
				return existing, nil
			}
		}

		copied := *b
		r.memBadges[b.ID] = &copied
		return &copied, nil
	}

	metaJSON, _ := json.Marshal(b.Metadata)

	query := `
		INSERT INTO badges (
			id, applicant_id, program_id, organization_id, badge_type,
			name, description, image_url, criteria_url, issued_at,
			revoked_at, metadata, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14
		)
		ON CONFLICT (applicant_id, badge_type) DO UPDATE
		SET updated_at = now()
		RETURNING id, applicant_id, program_id, organization_id, badge_type,
		          name, description, image_url, criteria_url, issued_at,
		          revoked_at, metadata, created_at, updated_at
	`

	row := r.pool.QueryRow(ctx, query,
		b.ID, b.ApplicantID, b.ProgramID, b.OrganizationID, b.BadgeType,
		b.Name, b.Description, b.ImageURL, b.CriteriaURL, b.IssuedAt,
		b.RevokedAt, metaJSON, b.CreatedAt, b.UpdatedAt,
	)

	var res model.Badge
	var resMeta []byte
	err := row.Scan(
		&res.ID, &res.ApplicantID, &res.ProgramID, &res.OrganizationID, &res.BadgeType,
		&res.Name, &res.Description, &res.ImageURL, &res.CriteriaURL, &res.IssuedAt,
		&res.RevokedAt, &resMeta, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("credential_repo: award badge: %w", err)
	}

	if len(resMeta) > 0 {
		_ = json.Unmarshal(resMeta, &res.Metadata)
	}
	return &res, nil
}

func (r *CredentialRepository) GetBadgeByID(ctx context.Context, id uuid.UUID) (*model.Badge, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		b, ok := r.memBadges[id]
		if !ok {
			return nil, ErrBadgeNotFound
		}
		res := *b
		return &res, nil
	}

	query := `
		SELECT b.id, b.applicant_id, b.program_id, b.organization_id, b.badge_type,
		       b.name, b.description, b.image_url, b.criteria_url, b.issued_at,
		       b.revoked_at, b.metadata, b.created_at, b.updated_at,
		       a.full_name as recipient_name, a.email as recipient_email,
		       p.name as program_name, o.name as organization_name
		FROM badges b
		JOIN applicants a ON a.id = b.applicant_id
		JOIN programs p ON p.id = b.program_id
		JOIN organizations o ON o.id = b.organization_id
		WHERE b.id = $1
	`

	var b model.Badge
	var metaJSON []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&b.ID, &b.ApplicantID, &b.ProgramID, &b.OrganizationID, &b.BadgeType,
		&b.Name, &b.Description, &b.ImageURL, &b.CriteriaURL, &b.IssuedAt,
		&b.RevokedAt, &metaJSON, &b.CreatedAt, &b.UpdatedAt,
		&b.RecipientName, &b.RecipientEmail, &b.ProgramName, &b.OrganizationName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrBadgeNotFound
		}
		return nil, fmt.Errorf("credential_repo: get badge: %w", err)
	}
	if len(metaJSON) > 0 {
		_ = json.Unmarshal(metaJSON, &b.Metadata)
	}
	return &b, nil
}

// RevokeBadge marks a badge as revoked; its hosted assertion then returns 410 Gone.
func (r *CredentialRepository) RevokeBadge(ctx context.Context, id uuid.UUID, revokedAt time.Time) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		b, ok := r.memBadges[id]
		if !ok {
			return ErrBadgeNotFound
		}
		b.RevokedAt = &revokedAt
		b.UpdatedAt = time.Now()
		return nil
	}

	tag, err := r.pool.Exec(ctx, `UPDATE badges SET revoked_at = $2, updated_at = now() WHERE id = $1`, id, revokedAt)
	if err != nil {
		return fmt.Errorf("credential_repo: revoke badge: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrBadgeNotFound
	}
	return nil
}

func (r *CredentialRepository) ListBadgesByApplicant(ctx context.Context, applicantID uuid.UUID) ([]*model.Badge, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []*model.Badge
		for _, b := range r.memBadges {
			if b.ApplicantID == applicantID {
				copied := *b
				list = append(list, &copied)
			}
		}
		return list, nil
	}

	query := `
		SELECT b.id, b.applicant_id, b.program_id, b.organization_id, b.badge_type,
		       b.name, b.description, b.image_url, b.criteria_url, b.issued_at,
		       b.revoked_at, b.metadata, b.created_at, b.updated_at,
		       a.full_name as recipient_name, a.email as recipient_email,
		       p.name as program_name, o.name as organization_name
		FROM badges b
		JOIN applicants a ON a.id = b.applicant_id
		JOIN programs p ON p.id = b.program_id
		JOIN organizations o ON o.id = b.organization_id
		WHERE b.applicant_id = $1
		ORDER BY b.issued_at ASC
	`

	rows, err := r.pool.Query(ctx, query, applicantID)
	if err != nil {
		return nil, fmt.Errorf("credential_repo: list badges by applicant: %w", err)
	}
	defer rows.Close()

	var list []*model.Badge
	for rows.Next() {
		var b model.Badge
		var metaJSON []byte
		if err := rows.Scan(
			&b.ID, &b.ApplicantID, &b.ProgramID, &b.OrganizationID, &b.BadgeType,
			&b.Name, &b.Description, &b.ImageURL, &b.CriteriaURL, &b.IssuedAt,
			&b.RevokedAt, &metaJSON, &b.CreatedAt, &b.UpdatedAt,
			&b.RecipientName, &b.RecipientEmail, &b.ProgramName, &b.OrganizationName,
		); err != nil {
			return nil, err
		}
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &b.Metadata)
		}
		list = append(list, &b)
	}
	return list, nil
}

func (r *CredentialRepository) ListBadgesByProgram(ctx context.Context, programID uuid.UUID) ([]*model.Badge, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []*model.Badge
		for _, b := range r.memBadges {
			if b.ProgramID == programID {
				copied := *b
				list = append(list, &copied)
			}
		}
		return list, nil
	}

	query := `
		SELECT b.id, b.applicant_id, b.program_id, b.organization_id, b.badge_type,
		       b.name, b.description, b.image_url, b.criteria_url, b.issued_at,
		       b.revoked_at, b.metadata, b.created_at, b.updated_at,
		       a.full_name as recipient_name, a.email as recipient_email,
		       p.name as program_name, o.name as organization_name
		FROM badges b
		JOIN applicants a ON a.id = b.applicant_id
		JOIN programs p ON p.id = b.program_id
		JOIN organizations o ON o.id = b.organization_id
		WHERE b.program_id = $1
		ORDER BY b.issued_at DESC
	`

	rows, err := r.pool.Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("credential_repo: list badges by program: %w", err)
	}
	defer rows.Close()

	var list []*model.Badge
	for rows.Next() {
		var b model.Badge
		var metaJSON []byte
		if err := rows.Scan(
			&b.ID, &b.ApplicantID, &b.ProgramID, &b.OrganizationID, &b.BadgeType,
			&b.Name, &b.Description, &b.ImageURL, &b.CriteriaURL, &b.IssuedAt,
			&b.RevokedAt, &metaJSON, &b.CreatedAt, &b.UpdatedAt,
			&b.RecipientName, &b.RecipientEmail, &b.ProgramName, &b.OrganizationName,
		); err != nil {
			return nil, err
		}
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &b.Metadata)
		}
		list = append(list, &b)
	}
	return list, nil
}

// ---------------------------------------------------------------------
// CERTIFICATE REPOSITORY METHODS
// ---------------------------------------------------------------------

func (r *CredentialRepository) CreateOrUpdateCertificate(ctx context.Context, c *model.Certificate) (*model.Certificate, error) {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	now := time.Now()
	if c.IssueDate.IsZero() {
		c.IssueDate = now
	}
	if c.CompletionDate.IsZero() {
		c.CompletionDate = now
	}
	c.CreatedAt = now
	c.UpdatedAt = now
	if c.Status == "" {
		c.Status = model.CertificateStatusIssued
	}
	if c.CertificateNumber == "" {
		c.CertificateNumber = fmt.Sprintf("CERT-%d-%s", c.IssueDate.Year(), strings.ToUpper(uuid.New().String()[:8]))
	}
	if c.VerificationCode == "" {
		c.VerificationCode = strings.ReplaceAll(uuid.New().String(), "-", "")
	}
	if c.Metadata == nil {
		c.Metadata = make(map[string]interface{})
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()

		for id, existing := range r.memCertificates {
			if existing.ApplicantID == c.ApplicantID && existing.ProgramID == c.ProgramID {
				c.ID = id
				c.CreatedAt = existing.CreatedAt
				c.CertificateNumber = existing.CertificateNumber
				c.VerificationCode = existing.VerificationCode
				if c.EmailSentAt == nil {
					c.EmailSentAt = existing.EmailSentAt
				}
				// Merge metadata so keys not provided in this update are preserved
				merged := make(map[string]interface{}, len(existing.Metadata)+len(c.Metadata))
				for k, v := range existing.Metadata {
					merged[k] = v
				}
				for k, v := range c.Metadata {
					merged[k] = v
				}
				c.Metadata = merged
				break
			}
		}

		copied := *c
		r.memCertificates[c.ID] = &copied
		return &copied, nil
	}

	metaJSON, _ := json.Marshal(c.Metadata)

	query := `
		INSERT INTO certificates (
			id, certificate_number, applicant_id, program_id, organization_id,
			recipient_name, recipient_email, program_name, track_name,
			issue_date, completion_date, status, verification_code,
			email_sent_at, metadata, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9,
			$10, $11, $12, $13,
			$14, $15, $16, $17
		)
		ON CONFLICT (applicant_id, program_id) DO UPDATE
		SET recipient_name = EXCLUDED.recipient_name,
		    recipient_email = EXCLUDED.recipient_email,
		    program_name = EXCLUDED.program_name,
		    track_name = EXCLUDED.track_name,
		    completion_date = EXCLUDED.completion_date,
		    metadata = COALESCE(certificates.metadata, '{}'::jsonb) || EXCLUDED.metadata,
		    updated_at = now()
		RETURNING id, certificate_number, applicant_id, program_id, organization_id,
		          recipient_name, recipient_email, program_name, track_name,
		          issue_date, completion_date, status, verification_code,
		          email_sent_at, metadata, created_at, updated_at
	`

	row := r.pool.QueryRow(ctx, query,
		c.ID, c.CertificateNumber, c.ApplicantID, c.ProgramID, c.OrganizationID,
		c.RecipientName, c.RecipientEmail, c.ProgramName, c.TrackName,
		c.IssueDate, c.CompletionDate, c.Status, c.VerificationCode,
		c.EmailSentAt, metaJSON, c.CreatedAt, c.UpdatedAt,
	)

	var res model.Certificate
	var resMeta []byte
	err := row.Scan(
		&res.ID, &res.CertificateNumber, &res.ApplicantID, &res.ProgramID, &res.OrganizationID,
		&res.RecipientName, &res.RecipientEmail, &res.ProgramName, &res.TrackName,
		&res.IssueDate, &res.CompletionDate, &res.Status, &res.VerificationCode,
		&res.EmailSentAt, &resMeta, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("credential_repo: create or update certificate: %w", err)
	}

	if len(resMeta) > 0 {
		_ = json.Unmarshal(resMeta, &res.Metadata)
	}
	return &res, nil
}

func (r *CredentialRepository) GetCertificateByID(ctx context.Context, id uuid.UUID) (*model.Certificate, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		c, ok := r.memCertificates[id]
		if !ok {
			return nil, ErrCertificateNotFound
		}
		res := *c
		return &res, nil
	}

	query := `
		SELECT c.id, c.certificate_number, c.applicant_id, c.program_id, c.organization_id,
		       c.recipient_name, c.recipient_email, c.program_name, c.track_name,
		       c.issue_date, c.completion_date, c.status, c.verification_code,
		       c.email_sent_at, c.metadata, c.created_at, c.updated_at,
		       o.name as organization_name
		FROM certificates c
		JOIN organizations o ON o.id = c.organization_id
		WHERE c.id = $1
	`

	var c model.Certificate
	var metaJSON []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&c.ID, &c.CertificateNumber, &c.ApplicantID, &c.ProgramID, &c.OrganizationID,
		&c.RecipientName, &c.RecipientEmail, &c.ProgramName, &c.TrackName,
		&c.IssueDate, &c.CompletionDate, &c.Status, &c.VerificationCode,
		&c.EmailSentAt, &metaJSON, &c.CreatedAt, &c.UpdatedAt,
		&c.OrganizationName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCertificateNotFound
		}
		return nil, fmt.Errorf("credential_repo: get certificate by id: %w", err)
	}
	if len(metaJSON) > 0 {
		_ = json.Unmarshal(metaJSON, &c.Metadata)
	}
	return &c, nil
}

func (r *CredentialRepository) GetCertificateByNumber(ctx context.Context, certNumber string) (*model.Certificate, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, c := range r.memCertificates {
			if strings.EqualFold(c.CertificateNumber, certNumber) {
				res := *c
				return &res, nil
			}
		}
		return nil, ErrCertificateNotFound
	}

	query := `
		SELECT c.id, c.certificate_number, c.applicant_id, c.program_id, c.organization_id,
		       c.recipient_name, c.recipient_email, c.program_name, c.track_name,
		       c.issue_date, c.completion_date, c.status, c.verification_code,
		       c.email_sent_at, c.metadata, c.created_at, c.updated_at,
		       o.name as organization_name
		FROM certificates c
		JOIN organizations o ON o.id = c.organization_id
		WHERE UPPER(c.certificate_number) = UPPER($1)
	`

	var c model.Certificate
	var metaJSON []byte
	err := r.pool.QueryRow(ctx, query, certNumber).Scan(
		&c.ID, &c.CertificateNumber, &c.ApplicantID, &c.ProgramID, &c.OrganizationID,
		&c.RecipientName, &c.RecipientEmail, &c.ProgramName, &c.TrackName,
		&c.IssueDate, &c.CompletionDate, &c.Status, &c.VerificationCode,
		&c.EmailSentAt, &metaJSON, &c.CreatedAt, &c.UpdatedAt,
		&c.OrganizationName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCertificateNotFound
		}
		return nil, fmt.Errorf("credential_repo: get certificate by number: %w", err)
	}
	if len(metaJSON) > 0 {
		_ = json.Unmarshal(metaJSON, &c.Metadata)
	}
	return &c, nil
}

func (r *CredentialRepository) GetCertificateByApplicantAndProgram(ctx context.Context, applicantID, programID uuid.UUID) (*model.Certificate, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		for _, c := range r.memCertificates {
			if c.ApplicantID == applicantID && c.ProgramID == programID {
				res := *c
				return &res, nil
			}
		}
		return nil, ErrCertificateNotFound
	}

	query := `
		SELECT c.id, c.certificate_number, c.applicant_id, c.program_id, c.organization_id,
		       c.recipient_name, c.recipient_email, c.program_name, c.track_name,
		       c.issue_date, c.completion_date, c.status, c.verification_code,
		       c.email_sent_at, c.metadata, c.created_at, c.updated_at,
		       o.name as organization_name
		FROM certificates c
		JOIN organizations o ON o.id = c.organization_id
		WHERE c.applicant_id = $1 AND c.program_id = $2
	`

	var c model.Certificate
	var metaJSON []byte
	err := r.pool.QueryRow(ctx, query, applicantID, programID).Scan(
		&c.ID, &c.CertificateNumber, &c.ApplicantID, &c.ProgramID, &c.OrganizationID,
		&c.RecipientName, &c.RecipientEmail, &c.ProgramName, &c.TrackName,
		&c.IssueDate, &c.CompletionDate, &c.Status, &c.VerificationCode,
		&c.EmailSentAt, &metaJSON, &c.CreatedAt, &c.UpdatedAt,
		&c.OrganizationName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCertificateNotFound
		}
		return nil, fmt.Errorf("credential_repo: get certificate by applicant and program: %w", err)
	}
	if len(metaJSON) > 0 {
		_ = json.Unmarshal(metaJSON, &c.Metadata)
	}
	return &c, nil
}

func (r *CredentialRepository) ListCertificatesByProgram(ctx context.Context, programID uuid.UUID) ([]*model.Certificate, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []*model.Certificate
		for _, c := range r.memCertificates {
			if c.ProgramID == programID {
				copied := *c
				list = append(list, &copied)
			}
		}
		return list, nil
	}

	query := `
		SELECT c.id, c.certificate_number, c.applicant_id, c.program_id, c.organization_id,
		       c.recipient_name, c.recipient_email, c.program_name, c.track_name,
		       c.issue_date, c.completion_date, c.status, c.verification_code,
		       c.email_sent_at, c.metadata, c.created_at, c.updated_at,
		       o.name as organization_name
		FROM certificates c
		JOIN organizations o ON o.id = c.organization_id
		WHERE c.program_id = $1
		ORDER BY c.issue_date DESC
	`

	rows, err := r.pool.Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("credential_repo: list certificates by program: %w", err)
	}
	defer rows.Close()

	var list []*model.Certificate
	for rows.Next() {
		var c model.Certificate
		var metaJSON []byte
		if err := rows.Scan(
			&c.ID, &c.CertificateNumber, &c.ApplicantID, &c.ProgramID, &c.OrganizationID,
			&c.RecipientName, &c.RecipientEmail, &c.ProgramName, &c.TrackName,
			&c.IssueDate, &c.CompletionDate, &c.Status, &c.VerificationCode,
			&c.EmailSentAt, &metaJSON, &c.CreatedAt, &c.UpdatedAt,
			&c.OrganizationName,
		); err != nil {
			return nil, err
		}
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &c.Metadata)
		}
		list = append(list, &c)
	}
	return list, nil
}

func (r *CredentialRepository) ListCertificatesByApplicant(ctx context.Context, applicantID uuid.UUID) ([]*model.Certificate, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []*model.Certificate
		for _, c := range r.memCertificates {
			if c.ApplicantID == applicantID {
				copied := *c
				list = append(list, &copied)
			}
		}
		return list, nil
	}

	query := `
		SELECT c.id, c.certificate_number, c.applicant_id, c.program_id, c.organization_id,
		       c.recipient_name, c.recipient_email, c.program_name, c.track_name,
		       c.issue_date, c.completion_date, c.status, c.verification_code,
		       c.email_sent_at, c.metadata, c.created_at, c.updated_at,
		       o.name as organization_name
		FROM certificates c
		JOIN organizations o ON o.id = c.organization_id
		WHERE c.applicant_id = $1
		ORDER BY c.issue_date DESC
	`

	rows, err := r.pool.Query(ctx, query, applicantID)
	if err != nil {
		return nil, fmt.Errorf("credential_repo: list certificates by applicant: %w", err)
	}
	defer rows.Close()

	var list []*model.Certificate
	for rows.Next() {
		var c model.Certificate
		var metaJSON []byte
		if err := rows.Scan(
			&c.ID, &c.CertificateNumber, &c.ApplicantID, &c.ProgramID, &c.OrganizationID,
			&c.RecipientName, &c.RecipientEmail, &c.ProgramName, &c.TrackName,
			&c.IssueDate, &c.CompletionDate, &c.Status, &c.VerificationCode,
			&c.EmailSentAt, &metaJSON, &c.CreatedAt, &c.UpdatedAt,
			&c.OrganizationName,
		); err != nil {
			return nil, err
		}
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &c.Metadata)
		}
		list = append(list, &c)
	}
	return list, nil
}

func (r *CredentialRepository) RecordCertificateEmailSent(ctx context.Context, certID uuid.UUID, sentAt time.Time) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if c, ok := r.memCertificates[certID]; ok {
			c.EmailSentAt = &sentAt
			c.UpdatedAt = time.Now()
			return nil
		}
		return ErrCertificateNotFound
	}

	query := `UPDATE certificates SET email_sent_at = $2, updated_at = now() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, certID, sentAt)
	if err != nil {
		return fmt.Errorf("credential_repo: record email sent: %w", err)
	}
	return nil
}
