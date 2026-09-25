package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kulkul/backend/internal/model"
)

var (
	ErrSessionNotFound    = errors.New("session not found")
	ErrAttendanceNotFound = errors.New("attendance record not found")
)

type SessionRepository struct {
	pool           *pgxpool.Pool
	mu             sync.RWMutex
	memSessions    map[uuid.UUID]*model.ProgramSession
	memAttendances map[string]*model.SessionAttendance // key: session_id + ":" + applicant_id
	appRepo        *ApplicantRepository                // for memory fallback joins
}

func NewSessionRepository(pool *pgxpool.Pool, appRepo *ApplicantRepository) *SessionRepository {
	return &SessionRepository{
		pool:           pool,
		memSessions:    make(map[uuid.UUID]*model.ProgramSession),
		memAttendances: make(map[string]*model.SessionAttendance),
		appRepo:        appRepo,
	}
}

func (r *SessionRepository) CreateSession(ctx context.Context, s *model.ProgramSession) (*model.ProgramSession, error) {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now
	if s.TargetApplicantIDs == nil {
		s.TargetApplicantIDs = []uuid.UUID{}
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		cp := *s
		r.memSessions[s.ID] = &cp
		return &cp, nil
	}

	rawTargets, _ := json.Marshal(s.TargetApplicantIDs)
	if len(rawTargets) == 0 {
		rawTargets = []byte("[]")
	}

	query := `
		INSERT INTO program_sessions (
			id, program_id, track_id, title, description, session_type,
			start_time, end_time, meeting_url, recording_url, mentor_id,
			target_applicant_ids,
			created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, program_id, track_id, title, description, session_type,
			start_time, end_time, meeting_url, recording_url, mentor_id,
			target_applicant_ids,
			created_at, updated_at
	`
	var res model.ProgramSession
	var resRawTargets []byte
	err := r.pool.QueryRow(ctx, query,
		s.ID, s.ProgramID, s.TrackID, s.Title, s.Description, string(s.SessionType),
		s.StartTime, s.EndTime, s.MeetingURL, s.RecordingURL, s.MentorID,
		rawTargets,
		s.CreatedAt, s.UpdatedAt,
	).Scan(
		&res.ID, &res.ProgramID, &res.TrackID, &res.Title, &res.Description, &res.SessionType,
		&res.StartTime, &res.EndTime, &res.MeetingURL, &res.RecordingURL, &res.MentorID,
		&resRawTargets,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("session_repo: create: %w", err)
	}
	if len(resRawTargets) > 0 {
		_ = json.Unmarshal(resRawTargets, &res.TargetApplicantIDs)
	}
	if res.TargetApplicantIDs == nil {
		res.TargetApplicantIDs = []uuid.UUID{}
	}
	return &res, nil
}

func (r *SessionRepository) GetSessionByID(ctx context.Context, id uuid.UUID) (*model.ProgramSession, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		s, ok := r.memSessions[id]
		if !ok {
			return nil, ErrSessionNotFound
		}
		cp := *s
		if cp.TargetApplicantIDs == nil {
			cp.TargetApplicantIDs = []uuid.UUID{}
		}
		return &cp, nil
	}

	query := `
		SELECT s.id, s.program_id, s.track_id, COALESCE(t.name, ''), s.title, s.description, s.session_type,
			s.start_time, s.end_time, s.meeting_url, s.recording_url, s.mentor_id, COALESCE(u.name, ''),
			COALESCE(s.target_applicant_ids, '[]'::jsonb),
			s.created_at, s.updated_at
		FROM program_sessions s
		LEFT JOIN program_tracks t ON s.track_id = t.id
		LEFT JOIN users u ON s.mentor_id = u.id
		WHERE s.id = $1
	`
	var res model.ProgramSession
	var rawTargets []byte
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&res.ID, &res.ProgramID, &res.TrackID, &res.TrackName, &res.Title, &res.Description, &res.SessionType,
		&res.StartTime, &res.EndTime, &res.MeetingURL, &res.RecordingURL, &res.MentorID, &res.MentorName,
		&rawTargets,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("session_repo: get by id: %w", err)
	}
	if len(rawTargets) > 0 {
		_ = json.Unmarshal(rawTargets, &res.TargetApplicantIDs)
	}
	if res.TargetApplicantIDs == nil {
		res.TargetApplicantIDs = []uuid.UUID{}
	}
	return &res, nil
}

func (r *SessionRepository) ListSessionsByProgram(ctx context.Context, programID uuid.UUID, trackID *uuid.UUID, fellowApplicantID *uuid.UUID) ([]model.ProgramSession, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.ProgramSession
		for _, s := range r.memSessions {
			if s.ProgramID == programID {
				if trackID != nil && s.TrackID != nil && *s.TrackID != *trackID {
					continue
				}
				// If fellow context, check student targeting
				if fellowApplicantID != nil && len(s.TargetApplicantIDs) > 0 {
					matched := false
					for _, tid := range s.TargetApplicantIDs {
						if tid == *fellowApplicantID {
							matched = true
							break
						}
					}
					if !matched {
						continue
					}
				}
				cp := *s
				if cp.TargetApplicantIDs == nil {
					cp.TargetApplicantIDs = []uuid.UUID{}
				}

				// Calculate memory attendances
				total := 0
				present := 0
				late := 0
				absent := 0
				excused := 0
				for key, att := range r.memAttendances {
					if att.SessionID == s.ID {
						total++
						switch att.Status {
						case model.AttendanceStatusPresent:
							present++
						case model.AttendanceStatusLate:
							late++
						case model.AttendanceStatusAbsent:
							absent++
						case model.AttendanceStatusExcused:
							excused++
						}
					}
					if fellowApplicantID != nil && key == fmt.Sprintf("%s:%s", s.ID, *fellowApplicantID) {
						attCp := *att
						cp.FellowAttendance = &attCp
					}
				}
				cp.TotalFellows = total
				cp.PresentCount = present
				cp.LateCount = late
				cp.AbsentCount = absent
				cp.ExcusedCount = excused
				if total > 0 {
					cp.AttendanceRate = int(math.Round(float64(present+late) / float64(total) * 100))
				}

				list = append(list, cp)
			}
		}
		return list, nil
	}

	query := `
		SELECT s.id, s.program_id, s.track_id, COALESCE(t.name, ''), s.title, s.description, s.session_type,
			s.start_time, s.end_time, s.meeting_url, s.recording_url, s.mentor_id, COALESCE(u.name, ''),
			COALESCE(s.target_applicant_ids, '[]'::jsonb),
			s.created_at, s.updated_at,
			COALESCE(att_stats.total_fellows, 0),
			COALESCE(att_stats.present_count, 0),
			COALESCE(att_stats.late_count, 0),
			COALESCE(att_stats.absent_count, 0),
			COALESCE(att_stats.excused_count, 0),
			fa.id, fa.status, fa.checked_in_at, fa.marked_by, COALESCE(fa.notes, ''), COALESCE(fa.proof_image_url, '')
		FROM program_sessions s
		LEFT JOIN program_tracks t ON s.track_id = t.id
		LEFT JOIN users u ON s.mentor_id = u.id
		LEFT JOIN (
			SELECT session_id,
				COUNT(*) as total_fellows,
				COUNT(*) FILTER (WHERE status = 'present') as present_count,
				COUNT(*) FILTER (WHERE status = 'late') as late_count,
				COUNT(*) FILTER (WHERE status = 'absent') as absent_count,
				COUNT(*) FILTER (WHERE status = 'excused') as excused_count
			FROM session_attendances
			GROUP BY session_id
		) att_stats ON s.id = att_stats.session_id
		LEFT JOIN session_attendances fa ON s.id = fa.session_id AND fa.applicant_id = $3
		WHERE s.program_id = $1
			AND ($2::uuid IS NULL OR s.track_id IS NULL OR s.track_id = $2::uuid)
			AND (
				$3::uuid IS NULL
				OR (
					jsonb_array_length(COALESCE(s.target_applicant_ids, '[]'::jsonb)) = 0
					OR s.target_applicant_ids @> to_jsonb($3::text)
				)
			)
		ORDER BY s.start_time ASC
	`
	rows, err := r.pool.Query(ctx, query, programID, trackID, fellowApplicantID)
	if err != nil {
		return nil, fmt.Errorf("session_repo: list by program: %w", err)
	}
	defer rows.Close()

	var list []model.ProgramSession
	for rows.Next() {
		var s model.ProgramSession
		var rawTargets []byte
		var faID *uuid.UUID
		var faStatus *string
		var faCheckedInAt *time.Time
		var faMarkedBy *uuid.UUID
		var faNotes string
		var faProofImageURL string

		if err := rows.Scan(
			&s.ID, &s.ProgramID, &s.TrackID, &s.TrackName, &s.Title, &s.Description, &s.SessionType,
			&s.StartTime, &s.EndTime, &s.MeetingURL, &s.RecordingURL, &s.MentorID, &s.MentorName,
			&rawTargets,
			&s.CreatedAt, &s.UpdatedAt,
			&s.TotalFellows, &s.PresentCount, &s.LateCount, &s.AbsentCount, &s.ExcusedCount,
			&faID, &faStatus, &faCheckedInAt, &faMarkedBy, &faNotes, &faProofImageURL,
		); err != nil {
			return nil, fmt.Errorf("session_repo: scan list by program: %w", err)
		}

		if len(rawTargets) > 0 {
			_ = json.Unmarshal(rawTargets, &s.TargetApplicantIDs)
		}
		if s.TargetApplicantIDs == nil {
			s.TargetApplicantIDs = []uuid.UUID{}
		}

		if s.TotalFellows > 0 {
			s.AttendanceRate = int(math.Round(float64(s.PresentCount+s.LateCount) / float64(s.TotalFellows) * 100))
		}

		if faID != nil && faStatus != nil && fellowApplicantID != nil {
			s.FellowAttendance = &model.SessionAttendance{
				ID:            *faID,
				SessionID:     s.ID,
				ApplicantID:   *fellowApplicantID,
				Status:        model.AttendanceStatus(*faStatus),
				CheckedInAt:   faCheckedInAt,
				MarkedBy:      faMarkedBy,
				Notes:         faNotes,
				ProofImageURL: faProofImageURL,
			}
		}

		list = append(list, s)
	}
	return list, rows.Err()
}

func (r *SessionRepository) UpdateSession(ctx context.Context, s *model.ProgramSession) (*model.ProgramSession, error) {
	s.UpdatedAt = time.Now()
	if s.TargetApplicantIDs == nil {
		s.TargetApplicantIDs = []uuid.UUID{}
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		existing, ok := r.memSessions[s.ID]
		if !ok {
			return nil, ErrSessionNotFound
		}
		existing.Title = s.Title
		existing.Description = s.Description
		existing.SessionType = s.SessionType
		existing.StartTime = s.StartTime
		existing.EndTime = s.EndTime
		existing.MeetingURL = s.MeetingURL
		existing.RecordingURL = s.RecordingURL
		existing.MentorID = s.MentorID
		existing.TrackID = s.TrackID
		existing.TargetApplicantIDs = s.TargetApplicantIDs
		existing.UpdatedAt = s.UpdatedAt
		cp := *existing
		return &cp, nil
	}

	rawTargets, _ := json.Marshal(s.TargetApplicantIDs)
	if len(rawTargets) == 0 {
		rawTargets = []byte("[]")
	}

	query := `
		UPDATE program_sessions
		SET title = $2, description = $3, session_type = $4, start_time = $5, end_time = $6,
			meeting_url = $7, recording_url = $8, mentor_id = $9, track_id = $10,
			target_applicant_ids = $11, updated_at = now()
		WHERE id = $1
		RETURNING id, program_id, track_id, title, description, session_type,
			start_time, end_time, meeting_url, recording_url, mentor_id,
			target_applicant_ids, created_at, updated_at
	`
	var res model.ProgramSession
	var resRawTargets []byte
	err := r.pool.QueryRow(ctx, query,
		s.ID, s.Title, s.Description, string(s.SessionType), s.StartTime, s.EndTime,
		s.MeetingURL, s.RecordingURL, s.MentorID, s.TrackID,
		rawTargets,
	).Scan(
		&res.ID, &res.ProgramID, &res.TrackID, &res.Title, &res.Description, &res.SessionType,
		&res.StartTime, &res.EndTime, &res.MeetingURL, &res.RecordingURL, &res.MentorID,
		&resRawTargets,
		&res.CreatedAt, &res.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("session_repo: update session: %w", err)
	}
	if len(resRawTargets) > 0 {
		_ = json.Unmarshal(resRawTargets, &res.TargetApplicantIDs)
	}
	if res.TargetApplicantIDs == nil {
		res.TargetApplicantIDs = []uuid.UUID{}
	}
	return &res, nil
}

func (r *SessionRepository) DeleteSession(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		if _, ok := r.memSessions[id]; !ok {
			return ErrSessionNotFound
		}
		delete(r.memSessions, id)
		return nil
	}

	tag, err := r.pool.Exec(ctx, "DELETE FROM program_sessions WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("session_repo: delete session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrSessionNotFound
	}
	return nil
}

func (r *SessionRepository) GetSessionAttendanceList(ctx context.Context, sessionID uuid.UUID) ([]model.SessionAttendance, error) {
	session, err := r.GetSessionByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var list []model.SessionAttendance
		if r.appRepo != nil {
			fellows, _ := r.appRepo.ListByProgram(ctx, session.ProgramID, string(model.StageApprovedForLive))
			for _, f := range fellows {
				if session.TrackID != nil && f.TrackID != nil && *session.TrackID != *f.TrackID {
					continue
				}
				if len(session.TargetApplicantIDs) > 0 {
					targeted := false
					for _, tid := range session.TargetApplicantIDs {
						if tid == f.ID {
							targeted = true
							break
						}
					}
					if !targeted {
						continue
					}
				}
				key := fmt.Sprintf("%s:%s", sessionID, f.ID)
				att, exists := r.memAttendances[key]
				if exists {
					item := *att
					item.FellowName = f.FullName
					item.FellowEmail = f.Email
					list = append(list, item)
				} else {
					list = append(list, model.SessionAttendance{
						ID:          uuid.New(),
						SessionID:   sessionID,
						ApplicantID: f.ID,
						Status:      model.AttendanceStatusAbsent,
						FellowName:  f.FullName,
						FellowEmail: f.Email,
					})
				}
			}
		}
		return list, nil
	}

	query := `
		SELECT
			a.id as applicant_id,
			a.full_name as fellow_name,
			a.email as fellow_email,
			COALESCE(t.name, '') as track_name,
			COALESCE(att.id, gen_random_uuid()) as attendance_id,
			COALESCE(att.status, 'absent') as status,
			att.checked_in_at,
			att.marked_by,
			COALESCE(att.notes, '') as notes,
			COALESCE(att.proof_image_url, '') as proof_image_url,
			COALESCE(att.created_at, now()) as created_at,
			COALESCE(att.updated_at, now()) as updated_at
		FROM applicants a
		LEFT JOIN program_tracks t ON a.track_id = t.id
		LEFT JOIN session_attendances att ON att.session_id = $1 AND att.applicant_id = a.id
		WHERE a.program_id = $2
			AND a.current_stage = 'approved_for_live'
			AND a.deleted_at IS NULL
			AND ($3::uuid IS NULL OR a.track_id IS NULL OR a.track_id = $3::uuid)
			AND ($4::uuid[] IS NULL OR cardinality($4::uuid[]) = 0 OR a.id = ANY($4::uuid[]))
		ORDER BY a.full_name ASC
	`
	rows, err := r.pool.Query(ctx, query, sessionID, session.ProgramID, session.TrackID, session.TargetApplicantIDs)
	if err != nil {
		return nil, fmt.Errorf("session_repo: get attendance list: %w", err)
	}
	defer rows.Close()

	var list []model.SessionAttendance
	for rows.Next() {
		var item model.SessionAttendance
		item.SessionID = sessionID
		var statusStr string
		if err := rows.Scan(
			&item.ApplicantID, &item.FellowName, &item.FellowEmail, &item.TrackName,
			&item.ID, &statusStr, &item.CheckedInAt, &item.MarkedBy, &item.Notes, &item.ProofImageURL,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("session_repo: scan attendance list: %w", err)
		}
		item.Status = model.AttendanceStatus(statusStr)
		list = append(list, item)
	}
	return list, rows.Err()
}

func (r *SessionRepository) BatchUpdateAttendance(ctx context.Context, sessionID uuid.UUID, attendances []model.SessionAttendance, markedBy uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		now := time.Now()
		for _, a := range attendances {
			key := fmt.Sprintf("%s:%s", sessionID, a.ApplicantID)
			existing, ok := r.memAttendances[key]
			if ok {
				existing.Status = a.Status
				existing.Notes = a.Notes
				existing.MarkedBy = &markedBy
				existing.UpdatedAt = now
				if a.Status == model.AttendanceStatusPresent && existing.CheckedInAt == nil {
					existing.CheckedInAt = &now
				}
			} else {
				a.ID = uuid.New()
				a.SessionID = sessionID
				a.MarkedBy = &markedBy
				a.CreatedAt = now
				a.UpdatedAt = now
				if a.Status == model.AttendanceStatusPresent {
					a.CheckedInAt = &now
				}
				cp := a
				r.memAttendances[key] = &cp
			}
		}
		return nil
	}

	query := `
		INSERT INTO session_attendances (
			session_id, applicant_id, status, marked_by, notes, updated_at
		) VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (session_id, applicant_id)
		DO UPDATE SET
			status = EXCLUDED.status,
			marked_by = EXCLUDED.marked_by,
			notes = EXCLUDED.notes,
			updated_at = now()
	`
	for _, a := range attendances {
		if _, err := r.pool.Exec(ctx, query, sessionID, a.ApplicantID, string(a.Status), markedBy, a.Notes); err != nil {
			return fmt.Errorf("session_repo: batch update attendance: %w", err)
		}
	}
	return nil
}

func (r *SessionRepository) FellowCheckIn(ctx context.Context, sessionID uuid.UUID, applicantID uuid.UUID, proofImageURL string, notes string) (*model.SessionAttendance, error) {
	session, err := r.GetSessionByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	status := model.AttendanceStatusPresent
	// If fellow checks in more than 15 minutes after session start time, record as late
	if now.After(session.StartTime.Add(15 * time.Minute)) {
		status = model.AttendanceStatusLate
	}

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		key := fmt.Sprintf("%s:%s", sessionID, applicantID)
		existing, ok := r.memAttendances[key]
		if ok {
			existing.Status = status
			if existing.CheckedInAt == nil {
				existing.CheckedInAt = &now
			}
			if proofImageURL != "" {
				existing.ProofImageURL = proofImageURL
			}
			if notes != "" {
				existing.Notes = notes
			}
			existing.UpdatedAt = now
			cp := *existing
			return &cp, nil
		}
		newAtt := &model.SessionAttendance{
			ID:            uuid.New(),
			SessionID:     sessionID,
			ApplicantID:   applicantID,
			Status:        status,
			CheckedInAt:   &now,
			ProofImageURL: proofImageURL,
			Notes:         notes,
			CreatedAt:     now,
			UpdatedAt:     now,
		}
		r.memAttendances[key] = newAtt
		cp := *newAtt
		return &cp, nil
	}

	query := `
		INSERT INTO session_attendances (
			session_id, applicant_id, status, checked_in_at, proof_image_url, notes, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (session_id, applicant_id)
		DO UPDATE SET
			status = CASE WHEN session_attendances.status = 'excused' THEN 'excused' ELSE EXCLUDED.status END,
			checked_in_at = COALESCE(session_attendances.checked_in_at, EXCLUDED.checked_in_at),
			proof_image_url = CASE WHEN EXCLUDED.proof_image_url <> '' THEN EXCLUDED.proof_image_url ELSE session_attendances.proof_image_url END,
			notes = CASE WHEN EXCLUDED.notes <> '' THEN EXCLUDED.notes ELSE session_attendances.notes END,
			updated_at = now()
		RETURNING id, session_id, applicant_id, status, checked_in_at, marked_by, notes, COALESCE(proof_image_url, ''), created_at, updated_at
	`
	var res model.SessionAttendance
	var statusStr string
	err = r.pool.QueryRow(ctx, query, sessionID, applicantID, string(status), now, proofImageURL, notes).Scan(
		&res.ID, &res.SessionID, &res.ApplicantID, &statusStr, &res.CheckedInAt, &res.MarkedBy, &res.Notes, &res.ProofImageURL, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("session_repo: fellow check in: %w", err)
	}
	res.Status = model.AttendanceStatus(statusStr)
	return &res, nil
}

func (r *SessionRepository) GetFellowAttendanceSummary(ctx context.Context, programID uuid.UUID) ([]model.FellowAttendanceSummary, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		var summaries []model.FellowAttendanceSummary
		if r.appRepo != nil {
			fellows, _ := r.appRepo.ListByProgram(ctx, programID, string(model.StageApprovedForLive))

			for _, f := range fellows {
				totalSessions := 0
				for _, s := range r.memSessions {
					if s.ProgramID == programID {
						if s.TrackID != nil && f.TrackID != nil && *s.TrackID != *f.TrackID {
							continue
						}
						if len(s.TargetApplicantIDs) > 0 {
							targeted := false
							for _, tid := range s.TargetApplicantIDs {
								if tid == f.ID {
									targeted = true
									break
								}
							}
							if !targeted {
								continue
							}
						}
						totalSessions++
					}
				}

				present := 0
				late := 0
				absent := 0
				excused := 0
				for _, att := range r.memAttendances {
					if att.ApplicantID == f.ID {
						switch att.Status {
						case model.AttendanceStatusPresent:
							present++
						case model.AttendanceStatusLate:
							late++
						case model.AttendanceStatusAbsent:
							absent++
						case model.AttendanceStatusExcused:
							excused++
						}
					}
				}
				rate := 0
				if totalSessions > 0 {
					rate = int(math.Round(float64(present+late) / float64(totalSessions) * 100))
				}
				statusLabel := "Good"
				if rate < 65 {
					statusLabel = "At Risk"
				} else if rate < 80 {
					statusLabel = "Warning"
				}

				summaries = append(summaries, model.FellowAttendanceSummary{
					ApplicantID:    f.ID,
					FullName:       f.FullName,
					Email:          f.Email,
					TotalSessions:  totalSessions,
					PresentCount:   present,
					LateCount:      late,
					AbsentCount:    absent,
					ExcusedCount:   excused,
					AttendanceRate: rate,
					Status:         statusLabel,
				})
			}
		}
		return summaries, nil
	}

	query := `
		WITH prog_sessions AS (
			SELECT id, track_id, COALESCE(target_applicant_ids, '[]'::jsonb) as target_applicant_ids
			FROM program_sessions
			WHERE program_id = $1
		),
		accepted_fellows AS (
			SELECT a.id, a.full_name, a.email, a.track_id, COALESCE(t.name, '') as track_name
			FROM applicants a
			LEFT JOIN program_tracks t ON a.track_id = t.id
			WHERE a.program_id = $1
				AND a.current_stage = 'approved_for_live'
				AND a.deleted_at IS NULL
		)
		SELECT
			f.id,
			f.full_name,
			f.email,
			f.track_name,
			(SELECT COUNT(*) FROM prog_sessions ps 
			 WHERE (ps.track_id IS NULL OR ps.track_id = f.track_id)
			   AND (jsonb_array_length(ps.target_applicant_ids) = 0 OR ps.target_applicant_ids @> to_jsonb(f.id::text))
			) as total_sessions,
			COUNT(att.id) FILTER (WHERE att.status = 'present') as present_count,
			COUNT(att.id) FILTER (WHERE att.status = 'late') as late_count,
			COUNT(att.id) FILTER (WHERE att.status = 'absent') as absent_count,
			COUNT(att.id) FILTER (WHERE att.status = 'excused') as excused_count
		FROM accepted_fellows f
		LEFT JOIN session_attendances att ON att.applicant_id = f.id
		GROUP BY f.id, f.full_name, f.email, f.track_id, f.track_name
		ORDER BY f.full_name ASC
	`
	rows, err := r.pool.Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("session_repo: attendance summary: %w", err)
	}
	defer rows.Close()

	var summaries []model.FellowAttendanceSummary
	for rows.Next() {
		var s model.FellowAttendanceSummary
		if err := rows.Scan(
			&s.ApplicantID, &s.FullName, &s.Email, &s.TrackName,
			&s.TotalSessions, &s.PresentCount, &s.LateCount, &s.AbsentCount, &s.ExcusedCount,
		); err != nil {
			return nil, fmt.Errorf("session_repo: scan summary: %w", err)
		}
		if s.TotalSessions > 0 {
			s.AttendanceRate = int(math.Round(float64(s.PresentCount+s.LateCount) / float64(s.TotalSessions) * 100))
		}
		if s.AttendanceRate >= 80 {
			s.Status = "Good"
		} else if s.AttendanceRate >= 65 {
			s.Status = "Warning"
		} else {
			s.Status = "At Risk"
		}
		summaries = append(summaries, s)
	}
	return summaries, rows.Err()
}
