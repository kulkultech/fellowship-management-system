package handler

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/calendar"
	"github.com/kulkul/backend/internal/holiday"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/recurrence"
	"github.com/kulkul/backend/internal/repository"
)

const pastSessionsInRangeMsg = "Some sessions in this range already happened, so they can't be moved. " +
	"To change how it repeats, open an upcoming session and choose \"This and following events\"."

type recurringCreateContext struct {
	syncIndonesian bool
	sendInvites    bool
	autoGenMeeting bool
	attendees      []calendar.Attendee
	programName    string
	trackName      string
	organizerEmail string
}

// occurrencePlan is the set of dates a repeat rule produces from a start time.
type occurrencePlan struct {
	normalized string
	loc        *time.Location
	starts     []time.Time
	skipped    []string // Indonesian national holidays left out
	openEnded  bool     // the rule has no end, so it was created for up to a year
}

// planOccurrences expands a repeat rule from start, leaving out Indonesian holidays when asked.
func planOccurrences(rrule, tz string, start time.Time, skipHolidays bool) (*occurrencePlan, error) {
	rule, err := recurrence.Parse(rrule)
	if err != nil {
		return nil, err
	}
	loc := repository.SeriesLocation(tz)
	plan := &occurrencePlan{normalized: rule.String(), loc: loc, openEnded: rule.Count == 0 && rule.Until.IsZero()}
	for _, t := range recurrence.Expand(rule, start.In(loc)) {
		if skipHolidays {
			if isHoliday, name := holiday.IsIndonesianHoliday(t); isHoliday {
				plan.skipped = append(plan.skipped, fmt.Sprintf("%s (%s)", t.Format("Mon, 2 Jan 2006"), name))
				continue
			}
		}
		plan.starts = append(plan.starts, t)
	}
	if len(plan.starts) == 0 {
		return nil, errors.New("every date of this repeat falls on an Indonesian national holiday")
	}
	return plan, nil
}

func localDate(t time.Time, loc *time.Location) time.Time {
	lt := t.In(loc)
	return time.Date(lt.Year(), lt.Month(), lt.Day(), 0, 0, 0, 0, time.UTC)
}

type recurringSessionResponse struct {
	*model.ProgramSession
	OccurrencesCreated int      `json:"occurrences_created"`
	SkippedHolidays    []string `json:"skipped_holidays,omitempty"`
}

func (h *SessionHandler) seriesCalendarLink(s *model.ProgramSession, rrule, tz string, attendees []calendar.Attendee) string {
	return calendar.RecurringWebURL(calendar.CreateEventRequest{
		Title: s.Title, Description: s.Description, StartTime: s.StartTime, EndTime: s.EndTime,
		MeetingURL: s.MeetingURL, Attendees: attendees, Recurrence: rrule, TimeZone: tz,
	})
}

// createRecurringSessions creates one session per date of the repeat rule, linked by a series,
// with a single repeating calendar event and one invitation email per person.
func (h *SessionHandler) createRecurringSessions(w http.ResponseWriter, r *http.Request, tmpl *model.ProgramSession, req CreateSessionRequest, c recurringCreateContext) {
	ctx := r.Context()
	duration := tmpl.EndTime.Sub(tmpl.StartTime)
	plan, err := planOccurrences(req.RecurrenceRule, req.TimeZone, tmpl.StartTime, c.syncIndonesian)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	var createdBy *uuid.UUID
	if claims, ok := middleware.GetUser(ctx); ok && claims != nil {
		id := claims.UserID
		createdBy = &id
	}
	series := &model.SessionSeries{ProgramID: tmpl.ProgramID, RRule: plan.normalized, Timezone: plan.loc.String(), CreatedBy: createdBy}

	first := *tmpl
	first.StartTime = plan.starts[0]
	first.EndTime = plan.starts[0].Add(duration)
	calLink := ""
	if h.calendarService != nil {
		ev, evErr := h.calendarService.CreateEvent(ctx, calendar.CreateEventRequest{
			SessionID: first.ID, ProgramID: first.ProgramID, ProgramName: c.programName, TrackName: c.trackName,
			Title: first.Title, Description: first.Description, SessionType: string(first.SessionType),
			StartTime: first.StartTime, EndTime: first.EndTime, MeetingURL: first.MeetingURL,
			AutoGenerateMeet: c.autoGenMeeting, Attendees: c.attendees, OrganizerEmail: c.organizerEmail,
			Recurrence: plan.normalized, TimeZone: series.Timezone,
		})
		if evErr == nil && ev != nil {
			series.GoogleCalendarEventID = ev.EventID
			calLink = ev.GoogleCalendarWebURL
			if ev.MeetingURL != "" {
				tmpl.MeetingURL = ev.MeetingURL
			}
		}
	}
	if calLink == "" {
		first.MeetingURL = tmpl.MeetingURL
		calLink = h.seriesCalendarLink(&first, plan.normalized, series.Timezone, c.attendees)
	}

	savedSeries, err := h.sessionRepo.CreateSeries(ctx, series)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create the repeating session")
		return
	}

	var createdIDs []uuid.UUID
	for i, st := range plan.starts {
		occ := *tmpl
		if i > 0 {
			occ.ID = uuid.New()
		}
		occ.StartTime = st
		occ.EndTime = st.Add(duration)
		occ.SeriesID = &savedSeries.ID
		occ.GoogleCalendarEventID = ""
		occ.GoogleCalendarHTMLLink = calLink
		saved, err := h.sessionRepo.CreateSession(ctx, &occ)
		if err != nil {
			// Undo the partial series so nothing half-made is left behind
			for _, id := range createdIDs {
				_ = h.sessionRepo.DeleteSession(ctx, id)
			}
			_ = h.sessionRepo.DeleteSeries(ctx, savedSeries.ID)
			httpx.Error(w, http.StatusInternalServerError, "failed to create the repeating sessions: "+err.Error())
			return
		}
		createdIDs = append(createdIDs, saved.ID)
	}

	firstSaved, err := h.sessionRepo.GetSessionByID(ctx, createdIDs[0])
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load the created session")
		return
	}

	// One invitation per person for the whole series
	if c.sendInvites && h.emailService != nil && len(c.attendees) > 0 {
		go func(attendees []calendar.Attendee, s *model.ProgramSession, pName, tName, calURL string) {
			for _, att := range attendees {
				if att.Email != "" {
					_ = h.emailService.SendSessionInvitationEmail(att.Email, att.Name, pName, tName, s, calURL)
				}
			}
		}(c.attendees, firstSaved, c.programName, c.trackName, calLink)
	}

	httpx.JSON(w, http.StatusCreated, recurringSessionResponse{
		ProgramSession:     firstSaved,
		OccurrencesCreated: len(createdIDs),
		SkippedHolidays:    plan.skipped,
	})
}

type recurrencePreviewRequest struct {
	StartTime              string `json:"start_time"`
	RecurrenceRule         string `json:"recurrence_rule"`
	TimeZone               string `json:"time_zone,omitempty"`
	SyncIndonesianCalendar *bool  `json:"sync_indonesian_calendar,omitempty"`
}

// PreviewRecurrence handles POST /api/v1/programs/{programId}/sessions/recurrence-preview.
// It tells the scheduler how many sessions a repeat rule creates before saving.
func (h *SessionHandler) PreviewRecurrence(w http.ResponseWriter, r *http.Request) {
	programID, err := uuid.Parse(chi.URLParam(r, "programId"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid program id")
		return
	}
	if !h.canManageSessions(r, programID) {
		httpx.Error(w, http.StatusForbidden, "unauthorized to schedule sessions for this program")
		return
	}
	var req recurrencePreviewRequest
	if err := httpx.Decode(w, r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	start, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid start_time")
		return
	}
	skip := req.SyncIndonesianCalendar == nil || *req.SyncIndonesianCalendar
	plan, err := planOccurrences(req.RecurrenceRule, req.TimeZone, start, skip)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	rule, _ := recurrence.Parse(plan.normalized)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"recurrence_rule":  plan.normalized,
		"description":      recurrence.Describe(rule, start.In(plan.loc)),
		"count":            len(plan.starts),
		"first_start":      plan.starts[0],
		"last_start":       plan.starts[len(plan.starts)-1],
		"skipped_holidays": plan.skipped,
		"open_ended":       plan.openEnded,
		"max_occurrences":  recurrence.MaxOccurrences,
	})
}

// truncateSeries makes a series end on the day before the given session.
func (h *SessionHandler) truncateSeries(r *http.Request, series *model.SessionSeries, before time.Time) error {
	rule, err := recurrence.Parse(series.RRule)
	if err != nil {
		return err
	}
	loc := repository.SeriesLocation(series.Timezone)
	lastDay := localDate(before, loc).AddDate(0, 0, -1)
	return h.sessionRepo.UpdateSeriesRule(r.Context(), series.ID, rule.WithUntil(lastDay).String())
}

// updateRecurringSessions applies an edit to "This and following events" or "All events" of a
// series, or turns a single session into a repeating one. Sessions that already happened keep
// their date and time; they only take the new details (title, mentor, ...).
func (h *SessionHandler) updateRecurringSessions(w http.ResponseWriter, r *http.Request, existing *model.ProgramSession, req CreateSessionRequest, scope string) {
	ctx := r.Context()
	newRule, err := recurrence.Normalize(req.RecurrenceRule)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	skipHolidays := req.SyncIndonesianCalendar == nil || *req.SyncIndonesianCalendar

	newStart, newEnd := existing.StartTime, existing.EndTime
	if req.StartTime != "" {
		if newStart, err = time.Parse(time.RFC3339, req.StartTime); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid start_time format: "+err.Error())
			return
		}
	}
	if req.EndTime != "" {
		if newEnd, err = time.Parse(time.RFC3339, req.EndTime); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid end_time format: "+err.Error())
			return
		}
	}
	if !newEnd.After(newStart) {
		httpx.Error(w, http.StatusBadRequest, "end_time must be after start_time")
		return
	}
	duration := newEnd.Sub(newStart)

	var series *model.SessionSeries
	var rows []model.ProgramSession
	tz := req.TimeZone
	if existing.SeriesID != nil {
		if series, err = h.sessionRepo.GetSeries(ctx, *existing.SeriesID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load the repeating session")
			return
		}
		if rows, err = h.sessionRepo.ListSeriesSessions(ctx, series.ID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load the repeating sessions")
			return
		}
		tz = series.Timezone
	} else {
		rows = []model.ProgramSession{*existing}
		scope = "all"
	}
	loc := repository.SeriesLocation(tz)

	var inScope []model.ProgramSession
	for _, s := range rows {
		if scope == "all" || s.ID == existing.ID || s.StartTime.After(existing.StartTime) {
			inScope = append(inScope, s)
		}
	}
	pivot := inScope[0]
	if scope == "following" {
		pivot = *existing
	}

	// The edited session moves by whole days plus a new clock time; the same move applies to the pivot.
	dayShift := int(localDate(newStart, loc).Sub(localDate(existing.StartTime, loc)).Hours() / 24)
	hour, minute, _ := newStart.In(loc).Clock()
	move := func(t time.Time) time.Time {
		d := t.In(loc).AddDate(0, 0, dayShift)
		return time.Date(d.Year(), d.Month(), d.Day(), hour, minute, 0, 0, loc)
	}

	oldRule := ""
	if series != nil {
		oldRule = series.RRule
	}
	regenerate := newRule != oldRule || dayShift != 0
	now := time.Now()

	applyDetails := func(s *model.ProgramSession) {
		if req.Title != "" {
			s.Title = req.Title
		}
		s.Description = req.Description
		if req.SessionType != "" {
			s.SessionType = req.SessionType
		}
		if req.MeetingURL != "" {
			s.MeetingURL = req.MeetingURL
		}
		s.MentorID = req.MentorID
		s.TrackID = req.TrackID
		if req.TargetApplicantIDs != nil {
			s.TargetApplicantIDs = req.TargetApplicantIDs
		}
		if s.ID == existing.ID {
			s.RecordingURL = req.RecordingURL
		}
	}

	if !regenerate {
		for i := range inScope {
			s := inScope[i]
			applyDetails(&s)
			if s.StartTime.After(now) {
				st := move(s.StartTime)
				s.StartTime, s.EndTime = st, st.Add(duration)
			}
			if _, err := h.sessionRepo.UpdateSession(ctx, &s); err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to update session: "+err.Error())
				return
			}
		}
		h.respondRecurringUpdate(w, r, existing.ID, len(inScope), nil)
		return
	}

	// Changing the repeat (or the date) recreates the upcoming sessions, so past ones must not be in range
	for _, s := range inScope {
		if s.ID != pivot.ID && !s.StartTime.After(now) {
			httpx.Error(w, http.StatusBadRequest, pastSessionsInRangeMsg)
			return
		}
	}
	pivotStarted := !pivot.StartTime.After(now)
	if pivotStarted && dayShift != 0 {
		httpx.Error(w, http.StatusBadRequest, pastSessionsInRangeMsg)
		return
	}
	pivotStart := move(pivot.StartTime)
	if pivotStarted {
		pivotStart = time.Date(pivot.StartTime.In(loc).Year(), pivot.StartTime.In(loc).Month(), pivot.StartTime.In(loc).Day(), hour, minute, 0, 0, loc)
	} else if skipHolidays {
		if isHoliday, name := holiday.IsIndonesianHoliday(pivotStart); isHoliday {
			httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("cannot schedule session on Indonesian national holiday: %s", name))
			return
		}
	}

	var plan *occurrencePlan
	if newRule != "" {
		if plan, err = planOccurrences(newRule, loc.String(), pivotStart, skipHolidays); err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	for _, s := range inScope {
		if s.ID != pivot.ID {
			if err := h.sessionRepo.DeleteSession(ctx, s.ID); err != nil && !errors.Is(err, repository.ErrSessionNotFound) {
				httpx.Error(w, http.StatusInternalServerError, "failed to replace the upcoming sessions")
				return
			}
		}
	}

	pivotIsFirst := series == nil || rows[0].ID == pivot.ID
	var targetSeriesID *uuid.UUID
	var claimsID *uuid.UUID
	if claims, ok := middleware.GetUser(ctx); ok && claims != nil {
		id := claims.UserID
		claimsID = &id
	}
	newSeries := func() error {
		created, err := h.sessionRepo.CreateSeries(ctx, &model.SessionSeries{ProgramID: pivot.ProgramID, RRule: newRule, Timezone: loc.String(), CreatedBy: claimsID})
		if err == nil {
			targetSeriesID = &created.ID
		}
		return err
	}
	switch {
	case newRule == "":
		// Stop repeating: this session stays as a single session
		if series != nil {
			if pivotIsFirst {
				err = h.sessionRepo.DeleteSeries(ctx, series.ID)
			} else {
				err = h.truncateSeries(r, series, pivot.StartTime)
			}
		}
	case series == nil:
		err = newSeries()
	case scope == "following" && !pivotIsFirst:
		if err = h.truncateSeries(r, series, pivot.StartTime); err == nil {
			err = newSeries()
		}
	default:
		err = h.sessionRepo.UpdateSeriesRule(ctx, series.ID, newRule)
		targetSeriesID = &series.ID
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update the repeat rule")
		return
	}

	applyDetails(&pivot)
	if !pivotStarted {
		pivot.StartTime, pivot.EndTime = pivotStart, pivotStart.Add(duration)
	}
	pivot.SeriesID = targetSeriesID
	var attendees []calendar.Attendee
	if newRule != "" {
		attendees, _ = h.sessionRepo.GetSessionInvitedAttendees(ctx, pivot.ProgramID, pivot.TrackID, pivot.TargetApplicantIDs, pivot.MentorID)
		linkSource := pivot
		linkSource.StartTime, linkSource.EndTime = pivotStart, pivotStart.Add(duration)
		pivot.GoogleCalendarHTMLLink = h.seriesCalendarLink(&linkSource, newRule, loc.String(), attendees)
	}
	if _, err := h.sessionRepo.UpdateSession(ctx, &pivot); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update session: "+err.Error())
		return
	}

	created := 1
	if plan != nil {
		pivotDay := localDate(pivotStart, loc)
		for _, st := range plan.starts {
			if localDate(st, loc).Equal(pivotDay) {
				continue
			}
			occ := pivot
			occ.ID = uuid.New()
			occ.StartTime, occ.EndTime = st, st.Add(duration)
			occ.RecordingURL = ""
			occ.EndedAt, occ.EndedByName = nil, ""
			occ.GoogleCalendarEventID = ""
			occ.WorkspaceState = nil
			if _, err := h.sessionRepo.CreateSession(ctx, &occ); err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to create the repeating sessions: "+err.Error())
				return
			}
			created++
		}

		// Let people know about the new dates when the scheduler asked for invitations
		if req.SendCalendarInvites != nil && *req.SendCalendarInvites && h.emailService != nil && len(attendees) > 0 {
			if updated, err := h.sessionRepo.GetSessionByID(ctx, pivot.ID); err == nil {
				programName := "Fellowship Cohort"
				if prog, pErr := h.programRepo.GetByID(ctx, pivot.ProgramID); pErr == nil && prog != nil && prog.Name != "" {
					programName = prog.Name
				}
				trackName := attendees[0].TrackName
				go func(s *model.ProgramSession, atts []calendar.Attendee) {
					for _, att := range atts {
						if att.Email != "" {
							_ = h.emailService.SendSessionInvitationEmail(att.Email, att.Name, programName, trackName, s, s.GoogleCalendarHTMLLink)
						}
					}
				}(updated, attendees)
			}
		}
	}
	var skipped []string
	if plan != nil {
		skipped = plan.skipped
	}
	h.respondRecurringUpdate(w, r, pivot.ID, created, skipped)
}

func (h *SessionHandler) respondRecurringUpdate(w http.ResponseWriter, r *http.Request, id uuid.UUID, count int, skipped []string) {
	updated, err := h.sessionRepo.GetSessionByID(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load the updated session")
		return
	}
	httpx.JSON(w, http.StatusOK, recurringSessionResponse{ProgramSession: updated, OccurrencesCreated: count, SkippedHolidays: skipped})
}

// deleteRecurringSessions deletes "This event", "This and following events" or "All events".
func (h *SessionHandler) deleteRecurringSessions(w http.ResponseWriter, r *http.Request, existing *model.ProgramSession, scope string) {
	ctx := r.Context()
	series, err := h.sessionRepo.GetSeries(ctx, *existing.SeriesID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load the repeating session")
		return
	}
	rows, err := h.sessionRepo.ListSeriesSessions(ctx, series.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load the repeating sessions")
		return
	}

	var toDelete []uuid.UUID
	remaining := 0
	for _, s := range rows {
		switch {
		case scope == "all",
			scope == "following" && !s.StartTime.Before(existing.StartTime),
			s.ID == existing.ID:
			toDelete = append(toDelete, s.ID)
		default:
			remaining++
		}
	}
	for _, id := range toDelete {
		if err := h.sessionRepo.DeleteSession(ctx, id); err != nil && !errors.Is(err, repository.ErrSessionNotFound) {
			httpx.Error(w, http.StatusInternalServerError, "failed to delete session: "+err.Error())
			return
		}
	}

	switch {
	case remaining == 0:
		if h.calendarService != nil && series.GoogleCalendarEventID != "" {
			_ = h.calendarService.DeleteEvent(ctx, series.GoogleCalendarEventID)
		}
		err = h.sessionRepo.DeleteSeries(ctx, series.ID)
	case scope == "following":
		err = h.truncateSeries(r, series, existing.StartTime)
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update the repeat rule")
		return
	}

	msg := "session deleted successfully"
	if len(toDelete) > 1 {
		msg = fmt.Sprintf("%d sessions deleted", len(toDelete))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"message": msg, "deleted": len(toDelete)})
}
