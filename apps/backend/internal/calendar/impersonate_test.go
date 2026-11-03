package calendar

import "testing"

// A fake key: JWTConfigFromJSON only parses the private key when it fetches a token.
const testServiceAccountJSON = `{"type":"service_account","client_email":"cal@example.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}`

func TestNewServiceImpersonatesConfiguredUser(t *testing.T) {
	svc := NewService(Config{ServiceAccountJSON: testServiceAccountJSON, Impersonate: " sessions@kulkul.tech "}, nil).(*googleCalendarService)
	if svc.jwtConfig == nil {
		t.Fatal("service account not loaded")
	}
	if svc.jwtConfig.Subject != "sessions@kulkul.tech" {
		t.Fatalf("subject = %q, want sessions@kulkul.tech", svc.jwtConfig.Subject)
	}

	svc = NewService(Config{ServiceAccountJSON: testServiceAccountJSON}, nil).(*googleCalendarService)
	if svc.jwtConfig.Subject != "" {
		t.Fatalf("subject = %q, want none when not configured", svc.jwtConfig.Subject)
	}
}
