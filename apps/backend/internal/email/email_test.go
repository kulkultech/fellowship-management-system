package email

import (
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/config"
)

func TestEmailTemplates(t *testing.T) {
	frontendURL := "https://fellowhire.kul.to"
	supportEmail := "support@fellowhire.kul.to"

	t.Run("RegistrationEmail", func(t *testing.T) {
		subj, html, text := buildRegistrationEmail("Alex Rivera", "Acme Corp", "https://fellowhire.kul.to/admin/login", frontendURL, supportEmail)
		if !strings.Contains(subj, "Acme Corp") {
			t.Errorf("expected subject to contain Acme Corp, got %s", subj)
		}
		if !strings.Contains(html, "KulKul") || !strings.Contains(html, "FellowHire") {
			t.Errorf("expected html to contain KulKul branding")
		}
		if !strings.Contains(text, "Alex Rivera") {
			t.Errorf("expected text to contain user name")
		}
	})

	t.Run("CompanyApprovedEmail", func(t *testing.T) {
		subj, html, text := buildCompanyApprovedEmail("Alex Rivera", "Acme Corp", "https://fellowhire.kul.to/admin/login", frontendURL, supportEmail)
		if !strings.Contains(subj, "Approved") || !strings.Contains(subj, "Acme Corp") {
			t.Errorf("expected subject to contain Approved and Acme Corp, got %s", subj)
		}
		if !strings.Contains(html, "Active &amp; Approved") {
			t.Errorf("expected html to contain Active & Approved status")
		}
		if !strings.Contains(text, "approved") {
			t.Errorf("expected text to mention approved")
		}
	})

	t.Run("ApplicationReceivedEmail", func(t *testing.T) {
		subj, html, _ := buildApplicationReceivedEmail("Jane Doe", "Tech Fellowship 2026", "Fullstack Track", "https://fellowhire.kul.to/test/abc", frontendURL, supportEmail, 30, 70)
		if !strings.Contains(subj, "Tech Fellowship 2026") {
			t.Errorf("expected subject to contain Tech Fellowship 2026")
		}
		if !strings.Contains(html, "Start Timed Logic Assessment") {
			t.Errorf("expected html to contain test button")
		}
	})

	t.Run("LogicTestSubmittedEmail", func(t *testing.T) {
		subj, html, _ := buildLogicTestSubmittedEmail("Jane Doe", "Tech Fellowship 2026", "Fullstack Track", "https://fellowhire.kul.to/result/abc", frontendURL, supportEmail)
		if !strings.Contains(subj, "Answers Received") {
			t.Errorf("expected subject to contain Answers Received")
		}
		if !strings.Contains(html, "Jane Doe") {
			t.Errorf("expected html to contain candidate name")
		}
	})

	t.Run("LogicTestResultEmail_Passed_AIInterviewNext", func(t *testing.T) {
		subj, html, _ := buildLogicTestResultEmail("Jane Doe", "Tech Fellowship 2026", "Fullstack Track", 92, 70, true, "https://fellowhire.kul.to/result", "https://fellowhire.kul.to/interview", "ai_interview", frontendURL, supportEmail)
		if !strings.Contains(subj, "Congratulations") {
			t.Errorf("expected passed subject to contain Congratulations")
		}
		if !strings.Contains(html, "92%") {
			t.Errorf("expected html to contain score 92%%")
		}
		if !strings.Contains(html, "Enter AI Video Interview Room") {
			t.Errorf("expected html to contain AI interview button")
		}
	})

	t.Run("LogicTestResultEmail_Passed_FillFormNext", func(t *testing.T) {
		subj, html, _ := buildLogicTestResultEmail("Jane Doe", "Tech Fellowship 2026", "Fullstack Track", 88, 70, true, "https://fellowhire.kul.to/result", "https://fellowhire.kul.to/programs/acme/tech/apply", "fill_form", frontendURL, supportEmail)
		if !strings.Contains(subj, "Congratulations") {
			t.Errorf("expected passed subject to contain Congratulations")
		}
		if !strings.Contains(html, "Complete Application Profile Form") {
			t.Errorf("expected html to contain profile form button")
		}
	})

	t.Run("LogicTestResultEmail_Failed", func(t *testing.T) {
		subj, html, _ := buildLogicTestResultEmail("John Smith", "Tech Fellowship 2026", "Fullstack Track", 55, 70, false, "https://fellowhire.kul.to/result", "", "", frontendURL, supportEmail)
		if !strings.Contains(subj, "Assessment Results") {
			t.Errorf("expected failed subject to contain Assessment Results")
		}
		if !strings.Contains(html, "55%") {
			t.Errorf("expected html to contain score 55%%")
		}
	})

	t.Run("AIInterviewInvitationEmail", func(t *testing.T) {
		subj, html, _ := buildAIInterviewInvitationEmail("Jane Doe", "Tech Fellowship 2026", "Fullstack Track", "https://fellowhire.kul.to/interview/abc", frontendURL, supportEmail, time.Now().Add(7*24*time.Hour))
		if !strings.Contains(subj, "Official Invitation") {
			t.Errorf("expected invitation subject")
		}
		if !strings.Contains(html, "Enter AI Video Interview Room") {
			t.Errorf("expected interview CTA button")
		}
	})

	t.Run("FinalInterviewInvitationEmail", func(t *testing.T) {
		subj, html, _ := buildFinalInterviewInvitationEmail("Jane Doe", "LIT 2026", "Fullstack Track", "https://fellowhire.kul.to/candidate/dashboard", "Prepare your GitHub projects.", frontendURL, supportEmail)
		if !strings.Contains(subj, "Next Stage") {
			t.Errorf("expected Next Stage in subject")
		}
		if !strings.Contains(html, "Prepare your GitHub projects") {
			t.Errorf("expected committee notes in html")
		}
	})

	t.Run("AdminInvitationEmail_OrgAdmin", func(t *testing.T) {
		subj, html, text := buildAdminInvitationEmail("Alice Admin", "org_admin", "Acme Labs", "https://fellowhire.kul.to/invite/accept?token=xyz", frontendURL, supportEmail)
		if !strings.Contains(subj, "Acme Labs") {
			t.Errorf("expected subject to contain Acme Labs, got %s", subj)
		}
		if !strings.Contains(html, "Organization Administrator") {
			t.Errorf("expected html to contain role")
		}
		if !strings.Contains(text, "Alice Admin") {
			t.Errorf("expected text to contain inviter name")
		}
	})

	t.Run("AdminInvitationEmail_Superadmin", func(t *testing.T) {
		subj, html, _ := buildAdminInvitationEmail("Super Admin", "superadmin", "", "https://fellowhire.kul.to/invite/accept?token=xyz", frontendURL, supportEmail)
		if !strings.Contains(subj, "Platform Superadmin") {
			t.Errorf("expected subject to contain Platform Superadmin, got %s", subj)
		}
		if !strings.Contains(html, "Platform Superadmin") {
			t.Errorf("expected html to contain role")
		}
	})
}

func TestSESService_SimulationMode(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg := config.SESConfig{
		Region:          "ap-south-1",
		AccessKeyID:     "",
		SecretAccessKey: "",
		FromEmail:       "support@fellowhire.kul.to",
		FrontendURL:     "https://fellowhire.kul.to",
	}

	svc := NewService(cfg, logger)
	if err := svc.SendRegistrationEmail("test@example.com", "Test User", "Test Corp", ""); err != nil {
		t.Fatalf("unexpected error in SendRegistrationEmail: %v", err)
	}
	if err := svc.SendApplicationReceivedEmail("test@example.com", "Test User", "LIT 2026", "Fullstack", "https://test.url", 30, 70); err != nil {
		t.Fatalf("unexpected error in SendApplicationReceivedEmail: %v", err)
	}
	if err := svc.SendAccountActivationEmail("test@example.com", "Test User", "https://fellowhire.kul.to/activate?token=abc"); err != nil {
		t.Fatalf("unexpected error in SendAccountActivationEmail: %v", err)
	}
	if err := svc.SendAdminInvitationEmail("test@example.com", "Alice Admin", "org_admin", "Acme Labs", "https://fellowhire.kul.to/invite/accept?token=xyz"); err != nil {
		t.Fatalf("unexpected error in SendAdminInvitationEmail: %v", err)
	}
}

