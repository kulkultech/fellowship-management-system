package calendar

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	meetReadonlyScope = "https://www.googleapis.com/auth/meetings.space.readonly"
	driveScope        = "https://www.googleapis.com/auth/drive"

	// A conference may start a little before the session's scheduled start (people join early)
	conferenceEarlyStart = time.Hour
)

// Recording is a finished Meet recording saved as an MP4 in the organizer's Google Drive.
type Recording struct {
	URL    string // plays the recording in the browser
	FileID string // the Drive file, for sharing it
}

// Recordings finds the Meet recordings of past sessions and, when enabled, shares them with the
// people invited to each session.
type Recordings struct {
	meetAPIBase  string
	driveAPIBase string
	readClient   func(context.Context) *http.Client // meetings.space.readonly
	shareClient  func(context.Context) *http.Client // drive; nil when sharing is off
}

// NewRecordings returns nil unless the service account is set up and Meet auto-recording is on.
func NewRecordings(cfg Config, logger *slog.Logger) *Recordings {
	if logger == nil {
		logger = slog.Default()
	}
	if strings.TrimSpace(cfg.ServiceAccountJSON) == "" || !cfg.AutoRecord {
		return nil
	}
	readCfg, err := serviceAccountJWT(cfg, meetReadonlyScope)
	if err != nil {
		logger.Warn("Meet recordings: invalid Google service account JSON", "error", err)
		return nil
	}
	r := &Recordings{
		meetAPIBase:  "https://meet.googleapis.com/v2",
		driveAPIBase: "https://www.googleapis.com/drive/v3",
		readClient:   readCfg.Client,
	}
	if cfg.ShareRecordings {
		if shareCfg, err := serviceAccountJWT(cfg, driveScope); err == nil {
			r.shareClient = shareCfg.Client
		}
	}
	logger.Info("Meet recordings will be added to sessions", "share_with_invitees", r.shareClient != nil)
	return r
}

type conferenceRecord struct {
	Name      string    `json:"name"`
	StartTime time.Time `json:"startTime"`
}

type meetRecording struct {
	State            string `json:"state"`
	DriveDestination struct {
		File      string `json:"file"`
		ExportURI string `json:"exportUri"`
	} `json:"driveDestination"`
}

// FindRecording returns the first finished recording of the Meet meeting at meetingURL that started
// around the session's time, or nil when there is none (yet). Recurring sessions share one Meet room,
// so the time window is what picks this session's meeting.
func (r *Recordings) FindRecording(ctx context.Context, meetingURL string, start, end time.Time) (*Recording, error) {
	code := meetingCodeFromURL(meetingURL)
	if code == "" {
		return nil, nil
	}
	client := r.readClient(ctx)

	filter := fmt.Sprintf(`space.meeting_code = "%s" AND start_time >= "%s" AND start_time <= "%s"`,
		code, meetTimestamp(start.Add(-conferenceEarlyStart)), meetTimestamp(end))
	var conferences struct {
		ConferenceRecords []conferenceRecord `json:"conferenceRecords"`
	}
	q := url.Values{"filter": {filter}, "pageSize": {"25"}}
	if err := getJSON(ctx, client, r.meetAPIBase+"/conferenceRecords?"+q.Encode(), &conferences); err != nil {
		return nil, fmt.Errorf("list meetings for %s: %w", code, err)
	}
	// Google lists the newest first; the session's first meeting is the one to show
	sort.Slice(conferences.ConferenceRecords, func(i, j int) bool {
		return conferences.ConferenceRecords[i].StartTime.Before(conferences.ConferenceRecords[j].StartTime)
	})

	for _, conf := range conferences.ConferenceRecords {
		var recs struct {
			Recordings []meetRecording `json:"recordings"`
		}
		if err := getJSON(ctx, client, r.meetAPIBase+"/"+conf.Name+"/recordings?pageSize=25", &recs); err != nil {
			return nil, fmt.Errorf("list recordings of %s: %w", conf.Name, err)
		}
		for _, rec := range recs.Recordings {
			if rec.State == "FILE_GENERATED" && rec.DriveDestination.ExportURI != "" {
				return &Recording{URL: rec.DriveDestination.ExportURI, FileID: rec.DriveDestination.File}, nil
			}
		}
	}
	return nil, nil
}

// SharingEnabled reports whether recordings are shared with invitees.
func (r *Recordings) SharingEnabled() bool { return r.shareClient != nil }

// ShareRecording gives each email view access to the recording, without Google's notification email
// (FellowHire shows the recording on the session instead). It tries every email and reports the ones
// that failed, for example addresses that aren't Google accounts.
func (r *Recordings) ShareRecording(ctx context.Context, fileID string, emails []string) error {
	if r.shareClient == nil || fileID == "" {
		return nil
	}
	client := r.shareClient(ctx)
	apiURL := fmt.Sprintf("%s/files/%s/permissions?sendNotificationEmail=false&supportsAllDrives=true",
		r.driveAPIBase, url.PathEscape(fileID))
	var failed []string
	for _, email := range emails {
		body := fmt.Sprintf(`{"role":"reader","type":"user","emailAddress":%q}`, email)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, strings.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			failed = append(failed, email)
			continue
		}
		err = googleAPIError(resp)
		resp.Body.Close()
		if err != nil {
			failed = append(failed, email)
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("could not share with %d of %d invitees: %s", len(failed), len(emails), strings.Join(failed, ", "))
	}
	return nil
}

func getJSON(ctx context.Context, client *http.Client, apiURL string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if err := googleAPIError(resp); err != nil {
		return err
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func googleAPIError(resp *http.Response) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("google api error %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
}

// meetTimestamp formats a time the way the Meet API's filter expects, e.g. 2024-01-01T00:00:00.000Z.
func meetTimestamp(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}
