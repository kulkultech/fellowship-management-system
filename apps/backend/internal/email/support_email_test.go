package email

import (
	"log/slog"
	"strings"
	"testing"

	"github.com/kulkul/backend/internal/config"
)

func TestSupportEmailDefaultsToKulkulInbox(t *testing.T) {
	svc := NewService(config.SESConfig{FromEmail: "support@fellowhire.kul.to"}, slog.Default()).(*SESService)
	if svc.supportEmail != "support@kulkul.tech" {
		t.Fatalf("supportEmail = %q, want support@kulkul.tech", svc.supportEmail)
	}
	if svc.fromEmail != "support@fellowhire.kul.to" {
		t.Fatalf("fromEmail = %q, sender should not change", svc.fromEmail)
	}

	_, html, text := buildAccountActivationEmail("Ana", "https://x/activate", svc.frontendURL, svc.supportEmail)
	if !strings.Contains(html, "Questions? Email <a href=\"mailto:support@kulkul.tech\">support@kulkul.tech</a>") {
		t.Fatal("footer does not point to support@kulkul.tech")
	}
	if strings.Contains(html+text, "support@fellowhire.kul.to") {
		t.Fatal("email still mentions support@fellowhire.kul.to")
	}
}
