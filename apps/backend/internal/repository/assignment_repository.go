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

var (
	ErrAssignmentNotFound           = errors.New("assignment not found")
	ErrAssignmentSubmissionNotFound = errors.New("assignment submission not found")
)

type AssignmentRepository struct {
	pool           *pgxpool.Pool
	mu             sync.RWMutex
	memAssignments map[uuid.UUID]*model.ProgramAssignment
	memSubmissions map[string]*model.AssignmentSubmission // key: assignment_id + ":" + applicant_id
	appRepo        *ApplicantRepository
	userRepo       *UserRepository
}

func NewAssignmentRepository(pool *pgxpool.Pool, appRepo *ApplicantRepository, userRepo *UserRepository) *AssignmentRepository {
	return &AssignmentRepository{
		pool:           pool,
		memAssignments: make(map[uuid.UUID]*model.ProgramAssignment),
		memSubmissions: make(map[string]*model.AssignmentSubmission),
		appRepo:        appRepo,
		userRepo:       userRepo,
	}
}

func (r *AssignmentRepository) CreateAssignment(ctx context.Context, a *model.ProgramAssignment) (*model.ProgramAssignment, error) {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	now := time.Now()
	a.CreatedAt = now
	a.UpdatedAt = now
	if a.Status == "" {
		a.Status = model.AssignmentStatusPublished
	}
	if a.MaxScore <= 0 {
		a.MaxScore = 100
	}
	if a.TargetApplicantIDs == nil {
		a.TargetApplicantIDs = []uuid.UUID{}
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		cp := *a
		r.memAssignments[a.ID] = &cp
		return &cp, nil
	}

	rawTargets, _ := json.Marshal(a.TargetApplicantIDs)
	if len(rawTargets) == 0 {
		rawTargets = []byte("[]")
	}

	query := `
		INSERT INTO program_assignments (
			id, program_id, track_id, creator_id, title, description,
			due_date, max_score, attachment_url, attachment_name, status,
			target_applicant_ids,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, program_id, track_id, creator_id, title, description,
			due_date, max_score, attachment_url, attachment_name, status,
			target_applicant_ids,
			created_at, updated_at
	`
	var res model.ProgramAssignment
	var resRawTargets []byte
	err := r.pool.QueryRow(ctx, query,
		a.ID, a.ProgramID, a.TrackID, a.CreatorID, a.Title, a.Description,
		a.DueDate, a.MaxScore, a.AttachmentURL, a.AttachmentName, string(a.Status),
		rawTargets,
		a.CreatedAt, a.UpdatedAt,
	).Scan(
		&res.ID, &res.ProgramID, &res.TrackID, &res.CreatorID, &res.Title, &res.Description,
		&res.DueDate, &res.MaxScore, &res.AttachmentURL, &res.AttachmentName, &res.Status,
		&resRawTargets,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("assignment_repo: create: %w", err)
	}
	if len(resRawTargets) > 0 {
		_ = json.Unmarshal(resRawTargets, &res.TargetApplicantIDs)
	}
	if res.TargetApplicantIDs == nil {
		res.TargetApplicantIDs = []uuid.UUID{}
	}
	return &res, nil
}

func (r *AssignmentRepository) GetAssignmentByID(ctx context.Context, id uuid.UUID) (*model.ProgramAssignment, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		a, ok := r.memAssignments[id]
		if !ok {
			return nil, ErrAssignmentNotFound
		}
		cp := *a
		if cp.TargetApplicantIDs == nil {
			cp.TargetApplicantIDs = []uuid.UUID{}
		}
		return &cp, nil
	}

	query := `
		SELECT a.id, a.program_id, a.track_id, COALESCE(t.name, ''), a.creator_id, COALESCE(u.name, ''),
			a.title, a.description, a.due_date, a.max_score, a.attachment_url, a.attachment_name, a.status,
			COALESCE(a.target_applicant_ids, '[]'::jsonb),
			a.created_at, a.updated_at,
			(SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) as total_subs,
			(SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'graded') as graded_subs
		FROM program_assignments a
		LEFT JOIN program_tracks t ON a.track_id = t.id
		LEFT JOIN users u ON a.creator_id = u.id
		WHERE a.id = $1
	`
	var a model.ProgramAssignment
	var rawTargets []byte
	var totalSubs, gradedSubs int
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&a.ID, &a.ProgramID, &a.TrackID, &a.TrackName, &a.CreatorID, &a.CreatorName,
		&a.Title, &a.Description, &a.DueDate, &a.MaxScore, &a.AttachmentURL, &a.AttachmentName, &a.Status,
		&rawTargets,
		&a.CreatedAt, &a.UpdatedAt, &totalSubs, &gradedSubs,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAssignmentNotFound
		}
		return nil, fmt.Errorf("assignment_repo: get: %w", err)
	}

	if len(rawTargets) > 0 {
		_ = json.Unmarshal(rawTargets, &a.TargetApplicantIDs)
	}
	if a.TargetApplicantIDs == nil {
		a.TargetApplicantIDs = []uuid.UUID{}
	}

	a.TotalSubmissions = totalSubs
	a.GradedCount = gradedSubs
	a.PendingCount = totalSubs - gradedSubs
	return &a, nil
}

func (r *AssignmentRepository) ListAssignmentsByProgram(
	ctx context.Context,
	programID uuid.UUID,
	trackID *uuid.UUID,
	fellowApplicantID *uuid.UUID,
) ([]*model.ProgramAssignment, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var res []*model.ProgramAssignment
		for _, a := range r.memAssignments {
			if a.ProgramID == programID {
				if trackID != nil && a.TrackID != nil && *a.TrackID != *trackID {
					continue
				}
				// If fellow context, check student targeting
				if fellowApplicantID != nil && len(a.TargetApplicantIDs) > 0 {
					matched := false
					for _, tid := range a.TargetApplicantIDs {
						if tid == *fellowApplicantID {
							matched = true
							break
						}
					}
					if !matched {
						continue
					}
				}
				cp := *a
				if cp.TargetApplicantIDs == nil {
					cp.TargetApplicantIDs = []uuid.UUID{}
				}
				if fellowApplicantID != nil {
					key := a.ID.String() + ":" + fellowApplicantID.String()
					if sub, ok := r.memSubmissions[key]; ok {
						subCp := *sub
						cp.MySubmission = &subCp
					}
				}
				res = append(res, &cp)
			}
		}
		return res, nil
	}

	query := `
		SELECT a.id, a.program_id, a.track_id, COALESCE(t.name, ''), a.creator_id, COALESCE(u.name, ''),
			a.title, a.description, a.due_date, a.max_score, a.attachment_url, a.attachment_name, a.status,
			COALESCE(a.target_applicant_ids, '[]'::jsonb),
			a.created_at, a.updated_at,
			(SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) as total_subs,
			(SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'graded') as graded_subs
		FROM program_assignments a
		LEFT JOIN program_tracks t ON a.track_id = t.id
		LEFT JOIN users u ON a.creator_id = u.id
		WHERE a.program_id = $1
			AND ($2::uuid IS NULL OR a.track_id IS NULL OR a.track_id = $2::uuid)
			AND (
				$3::uuid IS NULL
				OR (
					jsonb_array_length(COALESCE(a.target_applicant_ids, '[]'::jsonb)) = 0
					OR a.target_applicant_ids @> to_jsonb($3::text)
				)
			)
		ORDER BY COALESCE(a.due_date, a.created_at) ASC, a.created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, programID, trackID, fellowApplicantID)
	if err != nil {
		return nil, fmt.Errorf("assignment_repo: list: %w", err)
	}
	defer rows.Close()

	var assignments []*model.ProgramAssignment
	for rows.Next() {
		var a model.ProgramAssignment
		var rawTargets []byte
		var totalSubs, gradedSubs int
		if err := rows.Scan(
			&a.ID, &a.ProgramID, &a.TrackID, &a.TrackName, &a.CreatorID, &a.CreatorName,
			&a.Title, &a.Description, &a.DueDate, &a.MaxScore, &a.AttachmentURL, &a.AttachmentName, &a.Status,
			&rawTargets,
			&a.CreatedAt, &a.UpdatedAt, &totalSubs, &gradedSubs,
		); err != nil {
			return nil, fmt.Errorf("assignment_repo: scan list: %w", err)
		}
		if len(rawTargets) > 0 {
			_ = json.Unmarshal(rawTargets, &a.TargetApplicantIDs)
		}
		if a.TargetApplicantIDs == nil {
			a.TargetApplicantIDs = []uuid.UUID{}
		}
		a.TotalSubmissions = totalSubs
		a.GradedCount = gradedSubs
		a.PendingCount = totalSubs - gradedSubs
		assignments = append(assignments, &a)
	}

	// If candidate/fellow context, fetch fellow's submissions for these assignments
	if fellowApplicantID != nil && len(assignments) > 0 {
		subQuery := `
			SELECT s.id, s.assignment_id, s.applicant_id, s.user_id, s.file_url, s.file_name,
				s.file_size, s.github_url, s.notes, s.submitted_at, s.status, s.score,
				s.feedback, s.graded_by, COALESCE(u.name, ''), s.graded_at, s.created_at, s.updated_at
			FROM assignment_submissions s
			LEFT JOIN users u ON s.graded_by = u.id
			WHERE s.applicant_id = $1
		`
		subRows, err := r.pool.Query(ctx, subQuery, *fellowApplicantID)
		if err == nil {
			defer subRows.Close()
			subMap := make(map[uuid.UUID]*model.AssignmentSubmission)
			for subRows.Next() {
				var sub model.AssignmentSubmission
				if err := subRows.Scan(
					&sub.ID, &sub.AssignmentID, &sub.ApplicantID, &sub.UserID, &sub.FileURL, &sub.FileName,
					&sub.FileSize, &sub.GithubURL, &sub.Notes, &sub.SubmittedAt, &sub.Status, &sub.Score,
					&sub.Feedback, &sub.GradedBy, &sub.GraderName, &sub.GradedAt, &sub.CreatedAt, &sub.UpdatedAt,
				); err == nil {
					subMap[sub.AssignmentID] = &sub
				}
			}
			for _, a := range assignments {
				if sub, ok := subMap[a.ID]; ok {
					a.MySubmission = sub
				}
			}
		}
	}

	return assignments, nil
}

func (r *AssignmentRepository) UpdateAssignment(ctx context.Context, a *model.ProgramAssignment) (*model.ProgramAssignment, error) {
	a.UpdatedAt = time.Now()
	if a.MaxScore <= 0 {
		a.MaxScore = 100
	}
	if a.TargetApplicantIDs == nil {
		a.TargetApplicantIDs = []uuid.UUID{}
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if _, ok := r.memAssignments[a.ID]; !ok {
			return nil, ErrAssignmentNotFound
		}
		cp := *a
		r.memAssignments[a.ID] = &cp
		return &cp, nil
	}

	rawTargets, _ := json.Marshal(a.TargetApplicantIDs)
	if len(rawTargets) == 0 {
		rawTargets = []byte("[]")
	}

	query := `
		UPDATE program_assignments
		SET track_id = $2,
			title = $3,
			description = $4,
			due_date = $5,
			max_score = $6,
			attachment_url = $7,
			attachment_name = $8,
			status = $9,
			target_applicant_ids = $10,
			updated_at = $11
		WHERE id = $1
		RETURNING id, program_id, track_id, creator_id, title, description,
			due_date, max_score, attachment_url, attachment_name, status,
			target_applicant_ids,
			created_at, updated_at
	`
	var res model.ProgramAssignment
	var resRawTargets []byte
	err := r.pool.QueryRow(ctx, query,
		a.ID, a.TrackID, a.Title, a.Description,
		a.DueDate, a.MaxScore, a.AttachmentURL, a.AttachmentName, string(a.Status),
		rawTargets,
		a.UpdatedAt,
	).Scan(
		&res.ID, &res.ProgramID, &res.TrackID, &res.CreatorID, &res.Title, &res.Description,
		&res.DueDate, &res.MaxScore, &res.AttachmentURL, &res.AttachmentName, &res.Status,
		&resRawTargets,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAssignmentNotFound
		}
		return nil, fmt.Errorf("assignment_repo: update: %w", err)
	}
	if len(resRawTargets) > 0 {
		_ = json.Unmarshal(resRawTargets, &res.TargetApplicantIDs)
	}
	if res.TargetApplicantIDs == nil {
		res.TargetApplicantIDs = []uuid.UUID{}
	}
	return &res, nil
}

func (r *AssignmentRepository) DeleteAssignment(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		delete(r.memAssignments, id)
		return nil
	}

	query := `DELETE FROM program_assignments WHERE id = $1`
	ct, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("assignment_repo: delete: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrAssignmentNotFound
	}
	return nil
}

func (r *AssignmentRepository) SubmitAssignment(ctx context.Context, sub *model.AssignmentSubmission) (*model.AssignmentSubmission, error) {
	if sub.ID == uuid.Nil {
		sub.ID = uuid.New()
	}
	now := time.Now()
	sub.SubmittedAt = now
	sub.CreatedAt = now
	sub.UpdatedAt = now
	if sub.Status == "" {
		sub.Status = model.AssignmentSubmissionSubmitted
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		key := sub.AssignmentID.String() + ":" + sub.ApplicantID.String()
		cp := *sub
		r.memSubmissions[key] = &cp
		return &cp, nil
	}

	query := `
		INSERT INTO assignment_submissions (
			id, assignment_id, applicant_id, user_id, file_url, file_name,
			file_size, github_url, notes, submitted_at, status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (assignment_id, applicant_id) DO UPDATE
		SET file_url = EXCLUDED.file_url,
			file_name = EXCLUDED.file_name,
			file_size = EXCLUDED.file_size,
			github_url = EXCLUDED.github_url,
			notes = EXCLUDED.notes,
			submitted_at = EXCLUDED.submitted_at,
			status = CASE WHEN assignment_submissions.status = 'graded' THEN 'resubmitted' ELSE EXCLUDED.status END,
			updated_at = EXCLUDED.updated_at
		RETURNING id, assignment_id, applicant_id, user_id, file_url, file_name,
			file_size, github_url, notes, submitted_at, status, score, feedback,
			graded_by, graded_at, created_at, updated_at
	`
	var res model.AssignmentSubmission
	err := r.pool.QueryRow(ctx, query,
		sub.ID, sub.AssignmentID, sub.ApplicantID, sub.UserID, sub.FileURL, sub.FileName,
		sub.FileSize, sub.GithubURL, sub.Notes, sub.SubmittedAt, string(sub.Status),
		sub.CreatedAt, sub.UpdatedAt,
	).Scan(
		&res.ID, &res.AssignmentID, &res.ApplicantID, &res.UserID, &res.FileURL, &res.FileName,
		&res.FileSize, &res.GithubURL, &res.Notes, &res.SubmittedAt, &res.Status, &res.Score,
		&res.Feedback, &res.GradedBy, &res.GradedAt, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("assignment_repo: submit: %w", err)
	}
	return &res, nil
}

func (r *AssignmentRepository) GetSubmission(ctx context.Context, assignmentID, applicantID uuid.UUID) (*model.AssignmentSubmission, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		key := assignmentID.String() + ":" + applicantID.String()
		sub, ok := r.memSubmissions[key]
		if !ok {
			return nil, ErrAssignmentSubmissionNotFound
		}
		cp := *sub
		return &cp, nil
	}

	query := `
		SELECT s.id, s.assignment_id, s.applicant_id, s.user_id, s.file_url, s.file_name,
			s.file_size, s.github_url, s.notes, s.submitted_at, s.status, s.score,
			s.feedback, s.graded_by, COALESCE(u.name, ''), s.graded_at, s.created_at, s.updated_at
		FROM assignment_submissions s
		LEFT JOIN users u ON s.graded_by = u.id
		WHERE s.assignment_id = $1 AND s.applicant_id = $2
	`
	var sub model.AssignmentSubmission
	err := r.pool.QueryRow(ctx, query, assignmentID, applicantID).Scan(
		&sub.ID, &sub.AssignmentID, &sub.ApplicantID, &sub.UserID, &sub.FileURL, &sub.FileName,
		&sub.FileSize, &sub.GithubURL, &sub.Notes, &sub.SubmittedAt, &sub.Status, &sub.Score,
		&sub.Feedback, &sub.GradedBy, &sub.GraderName, &sub.GradedAt, &sub.CreatedAt, &sub.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAssignmentSubmissionNotFound
		}
		return nil, fmt.Errorf("assignment_repo: get submission: %w", err)
	}
	return &sub, nil
}

func (r *AssignmentRepository) ListSubmissions(ctx context.Context, assignmentID uuid.UUID) ([]*model.AssignmentSubmission, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var res []*model.AssignmentSubmission
		for _, s := range r.memSubmissions {
			if s.AssignmentID == assignmentID {
				cp := *s
				res = append(res, &cp)
			}
		}
		return res, nil
	}

	query := `
		SELECT s.id, s.assignment_id, s.applicant_id, s.user_id, s.file_url, s.file_name,
			s.file_size, s.github_url, s.notes, s.submitted_at, s.status, s.score,
			s.feedback, s.graded_by, COALESCE(gu.name, ''), s.graded_at, s.created_at, s.updated_at,
			COALESCE(app.full_name, ''), COALESCE(app.email, ''), COALESCE(t.name, ''), COALESCE(app.university, '')
		FROM assignment_submissions s
		LEFT JOIN applicants app ON s.applicant_id = app.id
		LEFT JOIN program_tracks t ON app.track_id = t.id
		LEFT JOIN users gu ON s.graded_by = gu.id
		WHERE s.assignment_id = $1
		ORDER BY s.submitted_at DESC
	`
	rows, err := r.pool.Query(ctx, query, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("assignment_repo: list submissions: %w", err)
	}
	defer rows.Close()

	var subs []*model.AssignmentSubmission
	for rows.Next() {
		var s model.AssignmentSubmission
		if err := rows.Scan(
			&s.ID, &s.AssignmentID, &s.ApplicantID, &s.UserID, &s.FileURL, &s.FileName,
			&s.FileSize, &s.GithubURL, &s.Notes, &s.SubmittedAt, &s.Status, &s.Score,
			&s.Feedback, &s.GradedBy, &s.GraderName, &s.GradedAt, &s.CreatedAt, &s.UpdatedAt,
			&s.FellowName, &s.FellowEmail, &s.TrackName, &s.University,
		); err != nil {
			return nil, fmt.Errorf("assignment_repo: scan submission: %w", err)
		}
		subs = append(subs, &s)
	}
	return subs, nil
}

func (r *AssignmentRepository) GradeSubmission(
	ctx context.Context,
	submissionID uuid.UUID,
	score float64,
	feedback string,
	graderID *uuid.UUID,
) (*model.AssignmentSubmission, error) {
	now := time.Now()

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		for _, s := range r.memSubmissions {
			if s.ID == submissionID {
				s.Score = &score
				s.Feedback = feedback
				s.GradedBy = graderID
				s.GradedAt = &now
				s.Status = model.AssignmentSubmissionGraded
				s.UpdatedAt = now
				cp := *s
				return &cp, nil
			}
		}
		return nil, ErrAssignmentSubmissionNotFound
	}

	query := `
		UPDATE assignment_submissions
		SET score = $2,
			feedback = $3,
			graded_by = $4,
			graded_at = $5,
			status = 'graded',
			updated_at = $5
		WHERE id = $1
		RETURNING id, assignment_id, applicant_id, user_id, file_url, file_name,
			file_size, github_url, notes, submitted_at, status, score, feedback,
			graded_by, graded_at, created_at, updated_at
	`
	var res model.AssignmentSubmission
	err := r.pool.QueryRow(ctx, query, submissionID, score, feedback, graderID, now).Scan(
		&res.ID, &res.AssignmentID, &res.ApplicantID, &res.UserID, &res.FileURL, &res.FileName,
		&res.FileSize, &res.GithubURL, &res.Notes, &res.SubmittedAt, &res.Status, &res.Score,
		&res.Feedback, &res.GradedBy, &res.GradedAt, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAssignmentSubmissionNotFound
		}
		return nil, fmt.Errorf("assignment_repo: grade: %w", err)
	}
	return &res, nil
}
