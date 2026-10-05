package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type mockCredentialEmailService struct {
	sentCertEmails []map[string]interface{}
}

func (m *mockCredentialEmailService) SendRegistrationEmail(recipientEmail, userName, companyName, loginURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendCompanyApprovedEmail(recipientEmail, userName, companyName, loginURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int) error {
	return nil
}
func (m *mockCredentialEmailService) SendLogicTestSubmittedEmail(recipientEmail, candidateName, programName, trackName, resultURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string) error {
	return nil
}
func (m *mockCredentialEmailService) SendAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time) error {
	return nil
}
func (m *mockCredentialEmailService) SendFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string) error {
	return nil
}
func (m *mockCredentialEmailService) SendAccountActivationEmail(recipientEmail, userName, activationURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendPasswordResetEmail(recipientEmail, userName, resetURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendAdminInvitationEmail(recipientEmail, inviterName, role, orgName, inviteURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendProgramRoomInvitationEmail(recipientEmail, candidateName, programName, trackName, roomURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendCustomApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockCredentialEmailService) SendCustomLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockCredentialEmailService) SendCustomAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockCredentialEmailService) SendCustomFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockCredentialEmailService) SendRejectionEmail(recipientEmail, candidateName, programName, trackName, notes string, customTmpl *model.EmailTemplateConfig) error {
	return nil
}
func (m *mockCredentialEmailService) SendCustomEmail(recipientEmail string, customTmpl *model.EmailTemplateConfig, vars map[string]string, actionURL string) error {
	return nil
}
func (m *mockCredentialEmailService) SendCertificateEmail(recipientEmail, candidateName, programName, trackName, certificateNumber, certificateURL, badgeURL string, issueDate time.Time) error {
	m.sentCertEmails = append(m.sentCertEmails, map[string]interface{}{
		"email":       recipientEmail,
		"name":        candidateName,
		"program":     programName,
		"track":       trackName,
		"cert_number": certificateNumber,
		"cert_url":    certificateURL,
		"badge_url":   badgeURL,
		"issue_date":  issueDate,
	})
	return nil
}
func (m *mockCredentialEmailService) SendSessionInvitationEmail(recipientEmail, recipientName, programName, trackName string, session *model.ProgramSession, googleCalURL string) error {
	return nil
}

func setupCredentialTestEnv(t *testing.T) (
	*repository.CredentialRepository,
	*repository.ApplicantRepository,
	*repository.ProgramRepository,
	*repository.OrgRepository,
	*handler.CredentialHandler,
	*mockCredentialEmailService,
	uuid.UUID,
	uuid.UUID,
	*model.Applicant,
) {
	credRepo := repository.NewCredentialRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	userRepo := repository.NewUserRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	emailMock := &mockCredentialEmailService{}

	credHandler := handler.NewCredentialHandler(
		credRepo,
		appRepo,
		progRepo,
		orgRepo,
		trackRepo,
		userRepo,
		emailMock,
		"https://fellowhire.com",
	)

	// Seed Organization
	org, err := orgRepo.Create(context.Background(), "kulkul", "KulKul Tech", "")
	if err != nil {
		t.Fatalf("failed to create org: %v", err)
	}
	orgID := org.ID

	// Seed Program
	progID := uuid.New()
	_, _ = progRepo.Create(context.Background(), &model.Program{
		ID:             progID,
		OrganizationID: orgID,
		Slug:           "lit-2026",
		Name:           "LIT Fellowship 2026",
	})

	// Seed Applicant
	appID := uuid.New()
	applicant, _, err := appRepo.CreateOrGet(context.Background(), &model.Applicant{
		ID:             appID,
		OrganizationID: orgID,
		ProgramID:      progID,
		Email:          "fellow@example.com",
		FullName:       "Grace Hopper",
		CurrentStage:   model.StageApprovedForLive,
	})
	if err != nil {
		t.Fatalf("failed to create applicant: %v", err)
	}

	return credRepo, appRepo, progRepo, orgRepo, credHandler, emailMock, orgID, progID, applicant
}

func TestOpenBadgesAndCertificateFlow(t *testing.T) {
	credRepo, _, _, _, credHandler, emailMock, orgID, _, applicant := setupCredentialTestEnv(t)

	// 1. Auto-award Member Badge
	memberBadge, err := credHandler.AutoAwardMemberBadge(context.Background(), applicant, "LIT Fellowship 2026", "https://fellowhire.com")
	if err != nil {
		t.Fatalf("expected no error awarding member badge, got: %v", err)
	}
	if memberBadge.BadgeType != model.BadgeTypeMember {
		t.Errorf("expected badge type %v, got %v", model.BadgeTypeMember, memberBadge.BadgeType)
	}
	if !strings.Contains(memberBadge.Name, "Member Badge") {
		t.Errorf("expected badge name to contain 'Member Badge', got: %s", memberBadge.Name)
	}

	// 2. Open Badges v2.0 Assertion Endpoint
	r := chi.NewRouter()
	r.Get("/api/v1/badges/assertions/{id}", credHandler.GetBadgeAssertionJSON)
	r.Get("/api/v1/badges/classes/{slug}", credHandler.GetBadgeClassJSON)
	r.Get("/api/v1/badges/issuer.json", credHandler.GetBadgeIssuerJSON)
	r.Get("/api/v1/certificates/verify/{certificateNumber}", credHandler.VerifyCertificatePublic)

	req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/badges/assertions/%s.json", memberBadge.ID.String()), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 from assertion endpoint, got: %d", w.Code)
	}
	var assertion model.OpenBadgeAssertion
	if err := json.Unmarshal(w.Body.Bytes(), &assertion); err != nil {
		t.Fatalf("failed to unmarshal assertion JSON: %v", err)
	}
	if assertion.Context != "https://w3id.org/openbadges/v2" {
		t.Errorf("expected @context https://w3id.org/openbadges/v2, got: %s", assertion.Context)
	}
	if assertion.Type != "Assertion" {
		t.Errorf("expected type Assertion, got: %s", assertion.Type)
	}
	if assertion.Recipient.Identity != "fellow@example.com" {
		t.Errorf("expected recipient fellow@example.com, got: %s", assertion.Recipient.Identity)
	}
	if assertion.Verification.Type != "hosted" {
		t.Errorf("expected verification type hosted, got: %s", assertion.Verification.Type)
	}

	// 3. Generate Certificate & Award Completion Badge via Handler
	genReqBody := []byte(`{"send_email": true}`)
	reqCert := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/applicants/%s/certificate", applicant.ID.String()), bytes.NewReader(genReqBody))
	reqCert.Header.Set("Content-Type", "application/json")

	claims := &auth.Claims{
		UserID:         uuid.New(),
		Email:          "admin@kulkul.org",
		Role:           "org_admin",
		OrganizationID: &orgID,
	}
	ctx := middleware.WithUser(reqCert.Context(), claims)
	reqCert = reqCert.WithContext(ctx)

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("applicantId", applicant.ID.String())
	reqCert = reqCert.WithContext(context.WithValue(reqCert.Context(), chi.RouteCtxKey, rctx))

	wCert := httptest.NewRecorder()
	credHandler.GenerateOrUpdateCertificate(wCert, reqCert)

	if wCert.Code != http.StatusOK {
		t.Fatalf("expected status 200 from certificate generation, got %d: %s", wCert.Code, wCert.Body.String())
	}
	var cert model.Certificate
	if err := json.Unmarshal(wCert.Body.Bytes(), &cert); err != nil {
		t.Fatalf("failed to unmarshal certificate: %v", err)
	}
	if cert.CertificateNumber == "" {
		t.Errorf("expected certificate number to be populated")
	}
	if cert.RecipientName != "Grace Hopper" {
		t.Errorf("expected recipient Grace Hopper, got: %s", cert.RecipientName)
	}
	if cert.ProgramName != "LIT Fellowship 2026" {
		t.Errorf("expected program LIT Fellowship 2026, got: %s", cert.ProgramName)
	}
	if cert.Status != model.CertificateStatusIssued {
		t.Errorf("expected status issued, got: %s", cert.Status)
	}

	// Verify email was sent
	if len(emailMock.sentCertEmails) != 1 {
		t.Fatalf("expected 1 certificate email sent, got: %d", len(emailMock.sentCertEmails))
	}
	if emailMock.sentCertEmails[0]["email"] != "fellow@example.com" {
		t.Errorf("expected email to fellow@example.com, got: %v", emailMock.sentCertEmails[0]["email"])
	}
	if emailMock.sentCertEmails[0]["cert_number"] != cert.CertificateNumber {
		t.Errorf("expected cert number in email %s, got: %v", cert.CertificateNumber, emailMock.sentCertEmails[0]["cert_number"])
	}

	// 4. Verify Public Certificate Verification Endpoint
	reqVerify := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/certificates/verify/%s", cert.CertificateNumber), nil)
	wVerify := httptest.NewRecorder()
	r.ServeHTTP(wVerify, reqVerify)

	if wVerify.Code != http.StatusOK {
		t.Fatalf("expected status 200 from certificate verification, got: %d", wVerify.Code)
	}
	var verification model.PublicCertificateVerification
	if err := json.Unmarshal(wVerify.Body.Bytes(), &verification); err != nil {
		t.Fatalf("failed to unmarshal verification JSON: %v", err)
	}
	if !verification.Valid {
		t.Errorf("expected certificate verification to be valid")
	}
	if verification.CertificateNumber != cert.CertificateNumber {
		t.Errorf("expected certificate number %s, got: %s", cert.CertificateNumber, verification.CertificateNumber)
	}
	if verification.RecipientName != "Grace Hopper" {
		t.Errorf("expected recipient Grace Hopper, got: %s", verification.RecipientName)
	}
	if verification.VerificationURL == "" {
		t.Errorf("expected verification URL to be populated")
	}
	if verification.LinkedInURL == "" {
		t.Errorf("expected LinkedIn URL to be populated")
	}

	// Check applicant now has both Member and Completion badges
	badges, err := credRepo.ListBadgesByApplicant(context.Background(), applicant.ID)
	if err != nil {
		t.Fatalf("failed to list badges: %v", err)
	}
	if len(badges) != 2 {
		t.Errorf("expected 2 badges (Member and Completion), got: %d", len(badges))
	}
}
