package calendar

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"testing"
)

func TestHostForPicksWorkspaceMentors(t *testing.T) {
	svc := NewService(Config{ServiceAccountJSON: testServiceAccountJSON, Impersonate: "Ragil@kulkul.tech", AutoRecord: true}, nil).(*googleCalendarService)
	cases := map[string]string{
		"umar@kulkul.tech":       "umar@kulkul.tech",
		" Umar@Kulkul.Tech ":     "umar@kulkul.tech",
		"mentor@gmail.com":       "ragil@kulkul.tech",
		"someone@notkulkul.tech": "ragil@kulkul.tech",
		"":                       "ragil@kulkul.tech",
	}
	for in, want := range cases {
		if got := svc.HostFor(in); got != want {
			t.Errorf("HostFor(%q) = %q, want %q", in, got, want)
		}
	}
	if svc.calendarIDFor("ragil@kulkul.tech") != "primary" || svc.calendarIDFor("umar@kulkul.tech") != "primary" {
		t.Error("calendar ids")
	}

	standalone := NewService(Config{}, nil)
	if standalone.HostFor("umar@kulkul.tech") != "" {
		t.Error("without a service account nothing is hosted in Google")
	}
}

func TestUpdateEventActsAsTheSessionsHost(t *testing.T) {
	var patched string
	srv := fakeMeetAPI(t, &patched)
	defer srv.Close()

	var actedAs []string
	svc := &googleCalendarService{
		meetAPIBase: srv.URL,
		meetClient: func(_ context.Context, host string) *http.Client {
			actedAs = append(actedAs, host)
			return srv.Client()
		},
		defaultHost: "ragil@kulkul.tech",
		logger:      slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	res, _ := svc.UpdateEvent(context.Background(), "google-event-1", CreateEventRequest{MeetingURL: "https://meet.google.com/abc-defg-hij", HostEmail: "umar@kulkul.tech"})
	if res.Host != "umar@kulkul.tech" || len(actedAs) != 1 || actedAs[0] != "umar@kulkul.tech" {
		t.Fatalf("host = %q, Meet calls acted as %v", res.Host, actedAs)
	}

	actedAs = nil
	res, _ = svc.UpdateEvent(context.Background(), "google-event-1", CreateEventRequest{MeetingURL: "https://meet.google.com/abc-defg-hij"})
	if res.Host != "ragil@kulkul.tech" || len(actedAs) != 1 || actedAs[0] != "ragil@kulkul.tech" {
		t.Fatalf("an event without a stored host belongs to the default account; host = %q, acted as %v", res.Host, actedAs)
	}
}
