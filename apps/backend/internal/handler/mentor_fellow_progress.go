package handler

import (
	"context"
	"math"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

// mentorFellow is a cohort fellow as mentors see them: the application plus how they are doing.
type mentorFellow struct {
	model.Applicant
	// Admission scores
	MCQScore *int `json:"mcq_score,omitempty"`
	AIScore  *int `json:"ai_score,omitempty"`
	// Progress in the program
	Assignments fellowAssignmentProgress `json:"assignments"`
	Attendance  *fellowAttendanceBrief   `json:"attendance,omitempty"`
}

type fellowAssignmentProgress struct {
	Total     int `json:"total"`     // published assignments meant for this fellow
	Submitted int `json:"submitted"` // of those, handed in
	Graded    int `json:"graded"`
	// AvgScore is the graded work's score as a percentage of its max points (nil until graded).
	AvgScore *int `json:"avg_score,omitempty"`
}

type fellowAttendanceBrief struct {
	TotalSessions int    `json:"total_sessions"`
	Attended      int    `json:"attended"` // present or late
	Rate          int    `json:"rate"`     // 0-100
	Status        string `json:"status"`   // Good, Warning, At Risk
}

// WithProgress lets ListFellows add scores, assignment grades and attendance to each fellow.
func (h *MentorHandler) WithProgress(
	submissionRepo *repository.SubmissionRepository,
	aiRepo *repository.AIInterviewRepository,
	assignmentRepo *repository.AssignmentRepository,
	sessionRepo *repository.SessionRepository,
) *MentorHandler {
	h.submissionRepo, h.aiRepo, h.assignmentRepo, h.sessionRepo = submissionRepo, aiRepo, assignmentRepo, sessionRepo
	return h
}

// withProgress loads every fellow's scores and progress with a handful of program-wide queries.
// Any part that fails to load is left out rather than failing the whole list.
func (h *MentorHandler) withProgress(ctx context.Context, programID uuid.UUID, fellows []model.Applicant) []mentorFellow {
	out := make([]mentorFellow, len(fellows))
	ids := make([]uuid.UUID, len(fellows))
	for i, f := range fellows {
		out[i].Applicant = f
		ids[i] = f.ID
	}

	if h.submissionRepo != nil {
		if subs, err := h.submissionRepo.LatestByApplicants(ctx, ids); err == nil {
			for i := range out {
				if s := subs[out[i].ID]; s != nil && s.SubmittedAt != nil {
					score := s.TotalScore
					out[i].MCQScore = &score
				}
			}
		}
	}
	if h.aiRepo != nil {
		if interviews, err := h.aiRepo.BestByApplicants(ctx, ids); err == nil {
			for i := range out {
				if ai := interviews[out[i].ID]; ai != nil && ai.ScorecardScore > 0 {
					score := ai.ScorecardScore
					out[i].AIScore = &score
				}
			}
		}
	}
	if h.assignmentRepo != nil {
		assignments, err1 := h.assignmentRepo.ListAssignmentsByProgram(ctx, programID, nil, nil)
		subs, err2 := h.assignmentRepo.ListSubmissionsByProgram(ctx, programID)
		if err1 == nil && err2 == nil {
			for i := range out {
				out[i].Assignments = assignmentProgress(out[i].Applicant, assignments, subs)
			}
		}
	}
	if h.sessionRepo != nil {
		if summaries, err := h.sessionRepo.GetFellowAttendanceSummary(ctx, programID); err == nil {
			byID := make(map[uuid.UUID]model.FellowAttendanceSummary, len(summaries))
			for _, s := range summaries {
				byID[s.ApplicantID] = s
			}
			for i := range out {
				if s, ok := byID[out[i].ID]; ok {
					out[i].Attendance = &fellowAttendanceBrief{
						TotalSessions: s.TotalSessions,
						Attended:      s.PresentCount + s.LateCount,
						Rate:          s.AttendanceRate,
						Status:        s.Status,
					}
				}
			}
		}
	}
	return out
}

// assignmentIsFor reports whether a published assignment is meant for this fellow: the whole
// cohort, their track, or a list of fellows that includes them.
func assignmentIsFor(f model.Applicant, a *model.ProgramAssignment) bool {
	if a.Status == model.AssignmentStatusDraft {
		return false
	}
	return model.AudienceIncludes(a.TrackID, a.TargetApplicantIDs, f.ID, f.TrackID)
}

// assignmentProgress counts one fellow's published assignments (all-cohort, their track, or
// targeted at them) and how many they handed in and got graded.
func assignmentProgress(f model.Applicant, assignments []*model.ProgramAssignment, subs []*model.AssignmentSubmission) fellowAssignmentProgress {
	mine := map[uuid.UUID]*model.ProgramAssignment{}
	for _, a := range assignments {
		if assignmentIsFor(f, a) {
			mine[a.ID] = a
		}
	}

	p := fellowAssignmentProgress{Total: len(mine)}
	var score, maxPoints float64
	for _, s := range subs {
		a, ok := mine[s.AssignmentID]
		if !ok || s.ApplicantID != f.ID {
			continue
		}
		p.Submitted++
		if s.Score != nil {
			p.Graded++
			score += *s.Score
			if a.MaxScore > 0 {
				maxPoints += float64(a.MaxScore)
			} else {
				maxPoints += 100
			}
		}
	}
	if maxPoints > 0 {
		avg := int(math.Round(score / maxPoints * 100))
		p.AvgScore = &avg
	}
	return p
}
