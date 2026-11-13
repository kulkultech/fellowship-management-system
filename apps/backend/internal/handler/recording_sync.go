package handler

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/kulkul/backend/internal/calendar"
	"github.com/kulkul/backend/internal/repository"
)

const (
	recordingSyncEvery   = 15 * time.Minute
	recordingSyncFirstIn = 2 * time.Minute
	// Google keeps meeting records for 30 days; a recording is usually ready within an hour or two,
	// so sessions that ended in the last few days are enough to check.
	recordingLookback = 72 * time.Hour
	// Give the meeting a few minutes to wrap up past its scheduled end before looking
	recordingGrace = 5 * time.Minute
)

// RecordingFinder looks up a session's Meet recording and shares it; *calendar.Recordings does both.
type RecordingFinder interface {
	FindRecording(ctx context.Context, meetingURL string, start, end time.Time) (*calendar.Recording, error)
	SharingEnabled() bool
	ShareRecording(ctx context.Context, fileID string, emails []string) error
}

// RecordingSync adds Google Meet recordings to sessions once Meet has finished processing them.
type RecordingSync struct {
	sessions *repository.SessionRepository
	finder   RecordingFinder
	logger   *slog.Logger
}

func NewRecordingSync(sessions *repository.SessionRepository, finder RecordingFinder, logger *slog.Logger) *RecordingSync {
	if logger == nil {
		logger = slog.Default()
	}
	return &RecordingSync{sessions: sessions, finder: finder, logger: logger}
}

// Start checks for new recordings every few minutes until ctx is cancelled.
func (s *RecordingSync) Start(ctx context.Context) {
	go func() {
		timer := time.NewTimer(recordingSyncFirstIn)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				s.RunOnce(ctx, time.Now())
				timer.Reset(recordingSyncEvery)
			}
		}
	}()
}

// RunOnce saves the recording of every recently ended Meet session that has one ready.
func (s *RecordingSync) RunOnce(ctx context.Context, now time.Time) {
	ids, err := s.sessions.ListSessionsAwaitingRecording(ctx, now.Add(-recordingLookback), now.Add(-recordingGrace))
	if err != nil {
		s.logger.Warn("recordings: list sessions", slog.Any("error", err))
		return
	}
	for _, id := range ids {
		sess, err := s.sessions.GetSessionByID(ctx, id)
		if err != nil {
			continue
		}
		rec, err := s.finder.FindRecording(ctx, sess.MeetingURL, sess.StartTime, sess.EndTime)
		if err != nil {
			s.logger.Warn("recordings: could not look up the Meet recording", slog.String("session_id", id.String()), slog.Any("error", err))
			continue
		}
		if rec == nil {
			continue // not recorded, or Meet is still processing it
		}
		saved, err := s.sessions.SetRecordingURL(ctx, id, rec.URL)
		if err != nil {
			s.logger.Warn("recordings: save", slog.String("session_id", id.String()), slog.Any("error", err))
			continue
		}
		if !saved {
			continue
		}
		s.logger.Info("recordings: added the Meet recording to the session", slog.String("session_id", id.String()), slog.String("title", sess.Title))

		if !s.finder.SharingEnabled() {
			continue
		}
		attendees, err := s.sessions.GetSessionInvitedAttendees(ctx, sess.ProgramID, sess.TrackID, sess.TargetApplicantIDs, sess.MentorID)
		if err != nil {
			s.logger.Warn("recordings: list invitees", slog.String("session_id", id.String()), slog.Any("error", err))
			continue
		}
		var emails []string
		for _, a := range attendees {
			if e := strings.TrimSpace(a.Email); e != "" {
				emails = append(emails, e)
			}
		}
		if err := s.finder.ShareRecording(ctx, rec.FileID, emails); err != nil {
			s.logger.Warn("recordings: share with invitees", slog.String("session_id", id.String()), slog.Any("error", err))
		}
	}
}
