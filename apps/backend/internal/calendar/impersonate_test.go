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

func TestAutoRecordUsesSeparateMeetScope(t *testing.T) {
	svc := NewService(Config{ServiceAccountJSON: testServiceAccountJSON, Impersonate: "ragil@kulkul.tech", AutoRecord: true}, nil).(*googleCalendarService)
	if svc.meetConfig == nil {
		t.Fatal("auto-record on but no Meet config")
	}
	if len(svc.meetConfig.Scopes) != 1 || svc.meetConfig.Scopes[0] != meetSettingsScope || svc.meetConfig.Subject != "ragil@kulkul.tech" {
		t.Fatalf("meet config = %v / %q", svc.meetConfig.Scopes, svc.meetConfig.Subject)
	}
	if len(svc.jwtConfig.Scopes) != 1 || svc.jwtConfig.Scopes[0] != "https://www.googleapis.com/auth/calendar.events" {
		t.Fatalf("calendar scopes changed: %v", svc.jwtConfig.Scopes)
	}

	svc = NewService(Config{ServiceAccountJSON: testServiceAccountJSON}, nil).(*googleCalendarService)
	if svc.meetConfig != nil {
		t.Fatal("Meet config set although auto-record is off")
	}
}
