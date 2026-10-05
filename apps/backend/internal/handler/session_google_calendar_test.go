package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/calendar"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type mockSessionCalendarEmailService struct {
	sentSessions []string
}

func (m *mockSessionCalendarEmailService) SendRegistrationEmail(recipientEmail, userName, companyName, loginURL string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendCompanyApprovedEmail(recipientEmail, userName, companyName, loginURL string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendLogicTestSubmittedEmail(recipientEmail, candidateName, programName, trackName, resultURL string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendAccountActivationEmail(recipientEmail, userName, activationURL string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendPasswordResetEmail(recipientEmail, userName, resetURL string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendAdminInvitationEmail(recipientEmail, inviterName, role, orgName, inviteURL string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendProgramRoomInvitationEmail(recipientEmail, candidateName, programName, trackName, roomURL string) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendCertificateEmail(recipientEmail, candidateName, programName, trackName, certificateNumber, certificateURL, badgeURL string, issueDate time.Time) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendSessionInvitationEmail(recipientEmail, recipientName, programName, trackName string, session *model.ProgramSession, googleCalURL string) error {
	m.sentSessions = append(m.sentSessions, recipientEmail)
	return nil
}
func (m *mockSessionCalendarEmailService) SendCustomApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendCustomLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendCustomAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendCustomFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendRejectionEmail(recipientEmail, candidateName, programName, trackName, notes string, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockSessionCalendarEmailService) SendCustomEmail(recipientEmail string, customTmpl *model.EmailTemplateConfig, vars map[string]string, actionURL string) error {
	return nil
}

func TestSessionGoogleCalendarAndMeetIntegration(t *testing.T) {
	sessionRepo := repository.NewSessionRepository(nil, nil)
	calSvc := calendar.NewService(calendar.Config{}, nil)
	emailMock := &mockSessionCalendarEmailService{}

	h := handler.NewSessionHandler(
		sessionRepo,
		nil,
		nil,
		nil,
		nil,
		calSvc,
		emailMock,
		"http://localhost:5173",
	)

	programID := uuid.New()
	targetApplicantID := uuid.New()

	r := chi.NewRouter()
	r.Post("/api/v1/programs/{programId}/sessions", h.CreateSession)
	r.Put("/api/v1/programs/{programId}/sessions/{sessionId}", h.UpdateSession)
	r.Delete("/api/v1/programs/{programId}/sessions/{sessionId}", h.DeleteSession)

	adminClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "admin@fellowhire.com",
		Role:   model.RoleSuperadmin,
	}

	t.Run("Create session automatically generates Google Meet and Calendar link", func(t *testing.T) {
		start := time.Date(2026, 11, 10, 19, 0, 0, 0, time.UTC)
		end := start.Add(90 * time.Minute)

		syncFalse := false
		autoMeet := true
		sendInvites := true

		bodyData := map[string]any{
			"title":                    "Live Workshop: Microservices",
			"description":              "Deep dive into gRPC and RabbitMQ",
			"session_type":             "workshop",
			"start_time":               start.Format(time.RFC3339),
			"end_time":                 end.Format(time.RFC3339),
			"target_applicant_ids":     []string{targetApplicantID.String()},
			"sync_indonesian_calendar": syncFalse,
			"auto_generate_meeting":    autoMeet,
			"send_calendar_invites":    sendInvites,
		}

		rawBody, _ := json.Marshal(bodyData)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+programID.String()+"/sessions", bytes.NewReader(rawBody))
		req = req.WithContext(middleware.WithUser(req.Context(), adminClaims))
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var created model.ProgramSession
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if !strings.HasPrefix(created.MeetingURL, "https://meet.google.com/") {
			t.Errorf("expected meeting_url to start with https://meet.google.com/, got: %s", created.MeetingURL)
		}

		if created.GoogleCalendarEventID == "" {
			t.Errorf("expected google_calendar_event_id to be populated")
		}

		if created.GoogleCalendarHTMLLink == "" {
			t.Errorf("expected google_calendar_html_link to be populated")
		}

		// Wait briefly for async invitation email dispatch
		time.Sleep(50 * time.Millisecond)

		if len(emailMock.sentSessions) == 0 {
			t.Errorf("expected email invitation to be sent to target attendees")
		}
	})
}
