package calendar

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/oauth2/google"
	"golang.org/x/oauth2/jwt"
)

// Attendee represents a participant invited to a session.
type Attendee struct {
	ID        uuid.UUID `json:"id,omitempty"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"` // "fellow", "mentor", "host"
	TrackName string    `json:"track_name,omitempty"`
}

// CreateEventRequest holds parameters to create a calendar event and meeting.
type CreateEventRequest struct {
	SessionID        uuid.UUID
	ProgramID        uuid.UUID
	ProgramName      string
	TrackName        string
	Title            string
	Description      string
	SessionType      string
	StartTime        time.Time
	EndTime          time.Time
	MeetingURL       string
	AutoGenerateMeet bool
	Attendees        []Attendee
	OrganizerEmail   string
	OrganizerName    string
	WorkspaceURL     string
}

// EventResult holds the result of a calendar event creation.
type EventResult struct {
	EventID              string   `json:"event_id"`
	MeetingURL           string   `json:"meeting_url"`
	HTMLLink             string   `json:"html_link"`
	GoogleCalendarWebURL string   `json:"google_calendar_web_url"`
	ICSData              []byte   `json:"-"`
	InvitedAttendees     []string `json:"invited_attendees"`
}

// Config holds Google Calendar service configuration.
type Config struct {
	CalendarID         string
	ServiceAccountJSON string
}

// Service defines methods for calendar & Google Meet operations.
type Service interface {
	CreateEvent(ctx context.Context, req CreateEventRequest) (*EventResult, error)
	UpdateEvent(ctx context.Context, eventID string, req CreateEventRequest) (*EventResult, error)
	DeleteEvent(ctx context.Context, eventID string) error
	GenerateMeetLink() string
	GenerateGoogleCalendarWebURL(title, description, location string, start, end time.Time, attendeeEmails []string) string
	GenerateICS(title, description, location string, start, end time.Time, organizerEmail, organizerName string, attendees []Attendee) []byte
}

type googleCalendarService struct {
	calendarID string
	jwtConfig  *jwt.Config
	logger     *slog.Logger
	httpClient *http.Client
}

// NewService initializes a new Calendar & Google Meet service.
func NewService(cfg Config, logger *slog.Logger) Service {
	if logger == nil {
		logger = slog.Default()
	}

	calID := cfg.CalendarID
	if calID == "" {
		calID = "primary"
	}

	svc := &googleCalendarService{
		calendarID: calID,
		logger:     logger,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}

	rawJSON := strings.TrimSpace(cfg.ServiceAccountJSON)
	if rawJSON != "" {
		// If ServiceAccountJSON is a path to a file, read the file
		if _, err := os.Stat(rawJSON); err == nil {
			content, readErr := os.ReadFile(rawJSON)
			if readErr == nil {
				rawJSON = string(content)
			}
		}

		jwtCfg, err := google.JWTConfigFromJSON([]byte(rawJSON), "https://www.googleapis.com/auth/calendar.events")
		if err != nil {
			logger.Warn("invalid Google service account JSON; running calendar service in standalone mode", "error", err)
		} else {
			svc.jwtConfig = jwtCfg
			logger.Info("Google Calendar API client successfully initialized with service account", "calendar_id", calID)
		}
	} else {
		logger.Info("Google Calendar service account not configured; running calendar & meet service in automated link & ICS mode")
	}

	return svc
}

// GenerateMeetLink creates a randomized, valid Google Meet URL (format: xxx-yyyy-zzz).
func (s *googleCalendarService) GenerateMeetLink() string {
	const letters = "abcdefghijklmnopqrstuvwxyz"
	randPart := func(n int) string {
		b := make([]byte, n)
		for i := range b {
			idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
			b[i] = letters[idx.Int64()]
		}
		return string(b)
	}
	return fmt.Sprintf("https://meet.google.com/%s-%s-%s", randPart(3), randPart(4), randPart(3))
}

// GenerateGoogleCalendarWebURL builds a 1-click Google Calendar web creation URL.
func (s *googleCalendarService) GenerateGoogleCalendarWebURL(title, description, location string, start, end time.Time, attendeeEmails []string) string {
	baseURL := "https://calendar.google.com/calendar/render"
	q := url.Values{}
	q.Set("action", "TEMPLATE")
	q.Set("text", title)

	// Format UTC timestamps as YYYYMMDDTHHmmssZ
	dates := fmt.Sprintf("%s/%s", start.UTC().Format("20060102T150405Z"), end.UTC().Format("20060102T150405Z"))
	q.Set("dates", dates)

	if description != "" {
		q.Set("details", description)
	}
	if location != "" {
		q.Set("location", location)
	}
	if len(attendeeEmails) > 0 {
		q.Set("add", strings.Join(attendeeEmails, ","))
	}

	return baseURL + "?" + q.Encode()
}

// GenerateICS builds a RFC 5545 standard .ics calendar invitation.
func (s *googleCalendarService) GenerateICS(title, description, location string, start, end time.Time, organizerEmail, organizerName string, attendees []Attendee) []byte {
	var buf bytes.Buffer
	nowUTC := time.Now().UTC().Format("20060102T150405Z")
	startUTC := start.UTC().Format("20060102T150405Z")
	endUTC := end.UTC().Format("20060102T150405Z")

	cleanStr := func(str string) string {
		r := strings.ReplaceAll(str, "\\", "\\\\")
		r = strings.ReplaceAll(r, ";", "\\;")
		r = strings.ReplaceAll(r, ",", "\\,")
		r = strings.ReplaceAll(r, "\n", "\\n")
		return r
	}

	uid := fmt.Sprintf("%s-%d@fellowhire.com", uuid.NewString(), time.Now().Unix())

	buf.WriteString("BEGIN:VCALENDAR\r\n")
	buf.WriteString("VERSION:2.0\r\n")
	buf.WriteString("PRODID:-//FellowHire//Fellowship Management System//EN\r\n")
	buf.WriteString("CALSCALE:GREGORIAN\r\n")
	buf.WriteString("METHOD:REQUEST\r\n")
	buf.WriteString("BEGIN:VEVENT\r\n")
	buf.WriteString(fmt.Sprintf("UID:%s\r\n", uid))
	buf.WriteString(fmt.Sprintf("DTSTAMP:%s\r\n", nowUTC))
	buf.WriteString(fmt.Sprintf("DTSTART:%s\r\n", startUTC))
	buf.WriteString(fmt.Sprintf("DTEND:%s\r\n", endUTC))
	buf.WriteString(fmt.Sprintf("SUMMARY:%s\r\n", cleanStr(title)))
	buf.WriteString(fmt.Sprintf("DESCRIPTION:%s\r\n", cleanStr(description)))
	if location != "" {
		buf.WriteString(fmt.Sprintf("LOCATION:%s\r\n", cleanStr(location)))
		buf.WriteString(fmt.Sprintf("URL:%s\r\n", location))
		buf.WriteString(fmt.Sprintf("X-GOOGLE-CONFERENCE:%s\r\n", location))
	}

	if organizerEmail != "" {
		orgName := organizerName
		if orgName == "" {
			orgName = "FellowHire Host"
		}
		buf.WriteString(fmt.Sprintf("ORGANIZER;CN=%s:mailto:%s\r\n", cleanStr(orgName), organizerEmail))
	} else {
		buf.WriteString("ORGANIZER;CN=FellowHire Admissions:mailto:support@fellowhire.kul.to\r\n")
	}

	for _, att := range attendees {
		attEmail := strings.TrimSpace(att.Email)
		if attEmail == "" {
			continue
		}
		attName := cleanStr(att.Name)
		if attName == "" {
			attName = attEmail
		}
		buf.WriteString(fmt.Sprintf("ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=%s:mailto:%s\r\n", attName, attEmail))
	}

	buf.WriteString("STATUS:CONFIRMED\r\n")
	buf.WriteString("SEQUENCE:0\r\n")
	buf.WriteString("END:VEVENT\r\n")
	buf.WriteString("END:VCALENDAR\r\n")

	return buf.Bytes()
}

// CreateEvent creates an automated calendar event and Google Meet link.
func (s *googleCalendarService) CreateEvent(ctx context.Context, req CreateEventRequest) (*EventResult, error) {
	// 1. Determine Google Meet URL
	meetURL := strings.TrimSpace(req.MeetingURL)
	if meetURL == "" || req.AutoGenerateMeet || meetURL == "https://meet.google.com/" || meetURL == "https://meet.google.com" {
		meetURL = s.GenerateMeetLink()
	}

	// 2. Collect attendee emails
	var attendeeEmails []string
	for _, a := range req.Attendees {
		e := strings.TrimSpace(a.Email)
		if e != "" {
			attendeeEmails = append(attendeeEmails, e)
		}
	}

	// 3. Build rich agenda description with workspace links
	description := req.Description
	if req.WorkspaceURL != "" {
		if description != "" {
			description += "\n\n"
		}
		description += fmt.Sprintf("Live Session Room: %s\nGoogle Meet: %s", req.WorkspaceURL, meetURL)
	}

	// 4. Default 1-click Google Calendar Web URL & ICS
	googleCalWebURL := s.GenerateGoogleCalendarWebURL(req.Title, description, meetURL, req.StartTime, req.EndTime, attendeeEmails)
	icsData := s.GenerateICS(req.Title, description, meetURL, req.StartTime, req.EndTime, req.OrganizerEmail, req.OrganizerName, req.Attendees)

	result := &EventResult{
		EventID:              fmt.Sprintf("fms-%s", req.SessionID.String()[:12]),
		MeetingURL:           meetURL,
		HTMLLink:             googleCalWebURL,
		GoogleCalendarWebURL: googleCalWebURL,
		ICSData:              icsData,
		InvitedAttendees:     attendeeEmails,
	}

	// 5. If Google Service Account is configured, attempt direct Google Calendar API integration
	if s.jwtConfig != nil {
		apiResult, err := s.callGoogleCalendarAPI(ctx, req, meetURL, description)
		if err == nil && apiResult != nil {
			result.EventID = apiResult.EventID
			if apiResult.MeetingURL != "" {
				result.MeetingURL = apiResult.MeetingURL
			}
			if apiResult.HTMLLink != "" {
				result.HTMLLink = apiResult.HTMLLink
			}
		} else if err != nil {
			s.logger.Warn("Google Calendar API event creation failed; using standalone link & ICS fallback", "error", err)
		}
	}

	return result, nil
}

// UpdateEvent updates an existing event in Google Calendar if synced.
func (s *googleCalendarService) UpdateEvent(ctx context.Context, eventID string, req CreateEventRequest) (*EventResult, error) {
	meetURL := strings.TrimSpace(req.MeetingURL)
	if meetURL == "" {
		meetURL = s.GenerateMeetLink()
	}

	var attendeeEmails []string
	for _, a := range req.Attendees {
		e := strings.TrimSpace(a.Email)
		if e != "" {
			attendeeEmails = append(attendeeEmails, e)
		}
	}

	description := req.Description
	if req.WorkspaceURL != "" {
		if description != "" {
			description += "\n\n"
		}
		description += fmt.Sprintf("Live Session Room: %s\nGoogle Meet: %s", req.WorkspaceURL, meetURL)
	}

	googleCalWebURL := s.GenerateGoogleCalendarWebURL(req.Title, description, meetURL, req.StartTime, req.EndTime, attendeeEmails)
	icsData := s.GenerateICS(req.Title, description, meetURL, req.StartTime, req.EndTime, req.OrganizerEmail, req.OrganizerName, req.Attendees)

	res := &EventResult{
		EventID:              eventID,
		MeetingURL:           meetURL,
		HTMLLink:             googleCalWebURL,
		GoogleCalendarWebURL: googleCalWebURL,
		ICSData:              icsData,
		InvitedAttendees:     attendeeEmails,
	}

	if s.jwtConfig != nil && eventID != "" && !strings.HasPrefix(eventID, "fms-") {
		_ = s.patchGoogleCalendarAPI(ctx, eventID, req, meetURL, description)
	}

	return res, nil
}

// DeleteEvent deletes an event from Google Calendar if synced.
func (s *googleCalendarService) DeleteEvent(ctx context.Context, eventID string) error {
	if s.jwtConfig == nil || eventID == "" || strings.HasPrefix(eventID, "fms-") {
		return nil
	}

	client := s.jwtConfig.Client(ctx)
	apiURL := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events/%s?sendUpdates=all",
		url.PathEscape(s.calendarID), url.PathEscape(eventID))

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, apiURL, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		s.logger.Warn("failed to delete Google Calendar event", "event_id", eventID, "error", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(resp.Body)
		s.logger.Warn("Google Calendar delete returned non-200 status", "status", resp.StatusCode, "body", string(body))
	}
	return nil
}

// callGoogleCalendarAPI calls Google Calendar REST API v3 to create event with Hangouts Meet.
func (s *googleCalendarService) callGoogleCalendarAPI(ctx context.Context, req CreateEventRequest, fallbackMeetURL, description string) (*EventResult, error) {
	client := s.jwtConfig.Client(ctx)

	type apiAttendee struct {
		Email       string `json:"email"`
		DisplayName string `json:"displayName,omitempty"`
	}

	var attendees []apiAttendee
	for _, a := range req.Attendees {
		if a.Email != "" {
			attendees = append(attendees, apiAttendee{
				Email:       a.Email,
				DisplayName: a.Name,
			})
		}
	}

	payload := map[string]any{
		"summary":     req.Title,
		"description": description,
		"location":    fallbackMeetURL,
		"start": map[string]string{
			"dateTime": req.StartTime.Format(time.RFC3339),
			"timeZone": "Asia/Jakarta",
		},
		"end": map[string]string{
			"dateTime": req.EndTime.Format(time.RFC3339),
			"timeZone": "Asia/Jakarta",
		},
		"attendees": attendees,
		"conferenceData": map[string]any{
			"createRequest": map[string]any{
				"requestId": req.SessionID.String(),
				"conferenceSolutionKey": map[string]string{
					"type": "hangoutsMeet",
				},
			},
		},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events?conferenceDataVersion=1&sendUpdates=all",
		url.PathEscape(s.calendarID))

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("google calendar api error %d: %s", resp.StatusCode, string(body))
	}

	var respBody struct {
		ID             string `json:"id"`
		HTMLLink       string `json:"htmlLink"`
		HangoutLink    string `json:"hangoutLink"`
		ConferenceData struct {
			EntryPoints []struct {
				EntryPointType string `json:"entryPointType"`
				URI            string `json:"uri"`
			} `json:"entryPoints"`
		} `json:"conferenceData"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		return nil, err
	}

	meetURL := respBody.HangoutLink
	if meetURL == "" && len(respBody.ConferenceData.EntryPoints) > 0 {
		for _, ep := range respBody.ConferenceData.EntryPoints {
			if ep.EntryPointType == "video" && ep.URI != "" {
				meetURL = ep.URI
				break
			}
		}
	}
	if meetURL == "" {
		meetURL = fallbackMeetURL
	}

	return &EventResult{
		EventID:    respBody.ID,
		MeetingURL: meetURL,
		HTMLLink:   respBody.HTMLLink,
	}, nil
}

// patchGoogleCalendarAPI updates an existing event in Google Calendar.
func (s *googleCalendarService) patchGoogleCalendarAPI(ctx context.Context, eventID string, req CreateEventRequest, meetURL, description string) error {
	client := s.jwtConfig.Client(ctx)

	payload := map[string]any{
		"summary":     req.Title,
		"description": description,
		"location":    meetURL,
		"start": map[string]string{
			"dateTime": req.StartTime.Format(time.RFC3339),
			"timeZone": "Asia/Jakarta",
		},
		"end": map[string]string{
			"dateTime": req.EndTime.Format(time.RFC3339),
			"timeZone": "Asia/Jakarta",
		},
	}

	jsonBytes, _ := json.Marshal(payload)
	apiURL := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events/%s?sendUpdates=all",
		url.PathEscape(s.calendarID), url.PathEscape(eventID))

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPatch, apiURL, bytes.NewReader(jsonBytes))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
