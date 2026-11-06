package handler

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

// reminderRule is one kind of reminder: sent while the item is between From and To away, and
// only if the item already existed when the reminder was due (otherwise the invite just went out).
type reminderRule struct {
	Kind string
	From time.Duration // the reminder window starts this long before the item...
	To   time.Duration // ...and ends this long before it
	Lead time.Duration // the item must have existed this long before it starts/is due
	Gap  time.Duration // and for this long already (so it doesn't follow the invite right away)
}

var (
	sessionDayRule      = reminderRule{Kind: "session_24h", From: 24 * time.Hour, To: 12 * time.Hour, Lead: 23 * time.Hour, Gap: 6 * time.Hour}
	sessionHourRule     = reminderRule{Kind: "session_1h", From: time.Hour, To: 0, Lead: 55 * time.Minute, Gap: 30 * time.Minute}
	assignmentDueRule   = reminderRule{Kind: "assignment_24h", From: 24 * time.Hour, To: time.Hour, Lead: 23 * time.Hour, Gap: 6 * time.Hour}
	reminderTickEvery   = 5 * time.Minute
	reminderFirstTickIn = time.Minute
)

// wants reports whether an item due at dueAt, created at createdAt, gets this reminder now.
func (rule reminderRule) wants(now, dueAt, createdAt time.Time) bool {
	left := dueAt.Sub(now)
	return left > rule.To && left <= rule.From &&
		!createdAt.After(dueAt.Add(-rule.Lead)) && now.Sub(createdAt) >= rule.Gap
}

// Reminders emails invitees before sessions start and fellows before assignments are due.
type Reminders struct {
	repo           *repository.ReminderRepository
	sessionRepo    *repository.SessionRepository
	assignmentRepo *repository.AssignmentRepository
	applicantRepo  *repository.ApplicantRepository
	programRepo    *repository.ProgramRepository
	orgRepo        *repository.OrgRepository
	email          email.Service
	frontendURL    string
	logger         *slog.Logger
}

func NewReminders(
	repo *repository.ReminderRepository,
	sessionRepo *repository.SessionRepository,
	assignmentRepo *repository.AssignmentRepository,
	applicantRepo *repository.ApplicantRepository,
	programRepo *repository.ProgramRepository,
	orgRepo *repository.OrgRepository,
	emailSvc email.Service,
	frontendURL string,
	logger *slog.Logger,
) *Reminders {
	return &Reminders{repo, sessionRepo, assignmentRepo, applicantRepo, programRepo, orgRepo, emailSvc, frontendURL, logger}
}

// Start checks for due reminders every few minutes until ctx is cancelled.
func (r *Reminders) Start(ctx context.Context) {
	go func() {
		timer := time.NewTimer(reminderFirstTickIn)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				r.RunOnce(ctx, time.Now())
				timer.Reset(reminderTickEvery)
			}
		}
	}()
}

// RunOnce sends every reminder that is due at now and not sent yet.
func (r *Reminders) RunOnce(ctx context.Context, now time.Time) {
	for _, rule := range []reminderRule{sessionDayRule, sessionHourRule} {
		items, err := r.repo.SessionsStartingBetween(ctx, now.Add(rule.To), now.Add(rule.From))
		if err != nil {
			r.logger.Warn("reminders: list sessions", slog.Any("error", err))
			continue
		}
		for _, it := range items {
			if rule.wants(now, it.DueAt, it.CreatedAt) && r.claim(ctx, rule, it) {
				r.remindSession(ctx, it.ID, rule, now)
			}
		}
	}

	items, err := r.repo.AssignmentsDueBetween(ctx, now.Add(assignmentDueRule.To), now.Add(assignmentDueRule.From))
	if err != nil {
		r.logger.Warn("reminders: list assignments", slog.Any("error", err))
		return
	}
	for _, it := range items {
		if assignmentDueRule.wants(now, it.DueAt, it.CreatedAt) && r.claim(ctx, assignmentDueRule, it) {
			r.remindAssignment(ctx, it.ID, now)
		}
	}
}

func (r *Reminders) claim(ctx context.Context, rule reminderRule, it repository.DueItem) bool {
	ok, err := r.repo.Claim(ctx, rule.Kind, it.ID, it.DueAt)
	if err != nil {
		r.logger.Warn("reminders: claim", slog.String("kind", rule.Kind), slog.Any("error", err))
	}
	return ok
}

func (r *Reminders) remindSession(ctx context.Context, sessionID uuid.UUID, rule reminderRule, now time.Time) {
	s, err := r.sessionRepo.GetSessionByID(ctx, sessionID)
	if err != nil || s == nil {
		return
	}
	attendees, err := r.sessionRepo.GetSessionInvitedAttendees(ctx, s.ProgramID, s.TrackID, s.TargetApplicantIDs, s.MentorID)
	if err != nil {
		return
	}
	programName, _ := r.programInfo(ctx, s.ProgramID)
	startsIn := whenText(s.StartTime, now)
	if rule.Kind == sessionHourRule.Kind {
		startsIn = soonText(s.StartTime, now)
	}
	sent := 0
	for _, att := range attendees {
		if att.Email == "" {
			continue
		}
		_ = r.email.SendSessionReminderEmail(att.Email, att.Name, programName, att.TrackName, s, s.GoogleCalendarHTMLLink, startsIn)
		sent++
	}
	r.logger.Info("reminders: session", slog.String("kind", rule.Kind), slog.String("session_id", s.ID.String()), slog.Int("sent", sent))
}

func (r *Reminders) remindAssignment(ctx context.Context, assignmentID uuid.UUID, now time.Time) {
	a, err := r.assignmentRepo.GetAssignmentByID(ctx, assignmentID)
	if err != nil || a == nil || a.DueDate == nil || a.Status != model.AssignmentStatusPublished {
		return
	}
	subs, err := r.assignmentRepo.ListSubmissions(ctx, a.ID)
	if err != nil {
		return
	}
	submitted := make(map[uuid.UUID]bool, len(subs))
	for _, s := range subs {
		submitted[s.ApplicantID] = true
	}
	programName, link := r.assignmentLink(ctx, a)
	dueIn := whenText(*a.DueDate, now)
	sent := 0
	for _, f := range programFellows(ctx, r.applicantRepo, a.ProgramID) {
		if f.Email == "" || submitted[f.ID] || !assignmentIsFor(f, a) {
			continue
		}
		_ = r.email.SendAssignmentReminderEmail(f.Email, f.FullName, programName, a, dueIn, link)
		sent++
	}
	r.logger.Info("reminders: assignment", slog.String("assignment_id", a.ID.String()), slog.Int("sent", sent))
}

// programInfo returns a program's name and its room address (empty if unknown).
func (r *Reminders) programInfo(ctx context.Context, programID uuid.UUID) (name, roomURL string) {
	return programInfo(ctx, r.programRepo, r.orgRepo, r.frontendURL, programID)
}

func (r *Reminders) assignmentLink(ctx context.Context, a *model.ProgramAssignment) (programName, link string) {
	return assignmentLink(ctx, r.programRepo, r.orgRepo, r.frontendURL, a)
}

// whenText says when something happens relative to now, in WIB: "today at 19:00 WIB",
// "tomorrow at 09:00 WIB" or "on Mon, 9 Nov at 09:00 WIB".
func whenText(t, now time.Time) string {
	loc := wib()
	t, now = t.In(loc), now.In(loc)
	day := func(x time.Time) time.Time { return time.Date(x.Year(), x.Month(), x.Day(), 0, 0, 0, 0, loc) }
	clock := t.Format("15:04") + " WIB"
	switch int(day(t).Sub(day(now)).Hours() / 24) {
	case 0:
		return "today at " + clock
	case 1:
		return "tomorrow at " + clock
	default:
		return "on " + t.Format("Mon, 2 Jan") + " at " + clock
	}
}

// soonText says how soon something starts: "in 1 hour" or "in 25 minutes".
func soonText(t, now time.Time) string {
	mins := int(t.Sub(now).Round(5 * time.Minute).Minutes())
	if mins >= 55 {
		return "in 1 hour"
	}
	if mins < 5 {
		return "in a few minutes"
	}
	return fmt.Sprintf("in %d minutes", mins)
}

func wib() *time.Location {
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		return loc
	}
	return time.FixedZone("WIB", 7*3600)
}
