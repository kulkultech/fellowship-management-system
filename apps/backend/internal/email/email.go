package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/model"
)

type Service interface {
	SendRegistrationEmail(recipientEmail, userName, companyName, loginURL string) error
	SendCompanyApprovedEmail(recipientEmail, userName, companyName, loginURL string) error
	SendApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int) error
	SendLogicTestSubmittedEmail(recipientEmail, candidateName, programName, trackName, resultURL string) error
	SendLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string) error
	SendAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time) error
	SendFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string) error
	SendAccountActivationEmail(recipientEmail, userName, activationURL string) error
	SendAdminInvitationEmail(recipientEmail, inviterName, role, orgName, inviteURL string) error

	SendCustomApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int, customTmpl *model.EmailTemplateConfig) error
	SendCustomLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string, customTmpl *model.EmailTemplateConfig) error
	SendCustomAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time, customTmpl *model.EmailTemplateConfig) error
	SendCustomFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string, customTmpl *model.EmailTemplateConfig) error
	SendRejectionEmail(recipientEmail, candidateName, programName, trackName, notes string, customTmpl *model.EmailTemplateConfig) error
	SendCustomEmail(recipientEmail string, customTmpl *model.EmailTemplateConfig, vars map[string]string, actionURL string) error
}

type SESService struct {
	client       *ses.Client
	smtpHost     string
	smtpPort     string
	smtpUser     string
	smtpPass     string
	fromEmail    string
	frontendURL  string
	supportEmail string
	logger       *slog.Logger
	enabled      bool
}

func NewService(cfg config.SESConfig, logger *slog.Logger) Service {
	s := &SESService{
		fromEmail:    cfg.FromEmail,
		frontendURL:  strings.TrimRight(cfg.FrontendURL, "/"),
		supportEmail: cfg.FromEmail,
		logger:       logger,
		enabled:      false,
	}

	if s.fromEmail == "" {
		s.fromEmail = "support@fellowhire.kul.to"
		s.supportEmail = "support@fellowhire.kul.to"
	}
	if s.frontendURL == "" {
		s.frontendURL = "http://localhost:5173"
	}

	if cfg.Enabled() {
		region := cfg.Region
		if region == "" {
			region = "ap-south-1"
		}

		s.smtpHost = fmt.Sprintf("email-smtp.%s.amazonaws.com", region)
		s.smtpPort = "587"
		s.smtpUser = cfg.AccessKeyID
		s.smtpPass = cfg.SecretAccessKey
		s.enabled = true

		creds := aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID,
			cfg.SecretAccessKey,
			"",
		))

		client := ses.New(ses.Options{
			Region:      region,
			Credentials: creds,
		})

		s.client = client
		logger.Info("AWS SES Email Service successfully initialized",
			"region", region,
			"smtp_host", s.smtpHost,
			"from", s.fromEmail,
		)
	} else {
		logger.Info("AWS SES credentials not provided; running Email Service in local simulation mode",
			"from", s.fromEmail,
		)
	}

	return s
}

func (s *SESService) send(recipient, subject, htmlBody, textBody string) {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return
	}

	// Dispatch asynchronously so the HTTP handler response is never blocked by SES API latency
	go func() {
		if !s.enabled {
			s.logger.Info("[EMAIL SIMULATION]",
				"to", recipient,
				"subject", subject,
				"from", s.fromEmail,
			)
			return
		}

		// Try sending via AWS SES SMTP (supports SES SMTP credentials natively)
		err := s.sendSMTP(recipient, subject, htmlBody, textBody)
		if err == nil {
			s.logger.Info("email dispatched successfully via AWS SES SMTP",
				"to", recipient,
				"subject", subject,
			)
			return
		}

		s.logger.Warn("AWS SES SMTP send failed, attempting AWS SDK fallback",
			"to", recipient,
			"subject", subject,
			"smtp_error", err,
		)

		if s.client != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			input := &ses.SendEmailInput{
				Source: aws.String(s.fromEmail),
				Destination: &types.Destination{
					ToAddresses: []string{recipient},
				},
				Message: &types.Message{
					Subject: &types.Content{
						Data:    aws.String(subject),
						Charset: aws.String("UTF-8"),
					},
					Body: &types.Body{
						Html: &types.Content{
							Data:    aws.String(htmlBody),
							Charset: aws.String("UTF-8"),
						},
						Text: &types.Content{
							Data:    aws.String(textBody),
							Charset: aws.String("UTF-8"),
						},
					},
				},
			}

			_, sdkErr := s.client.SendEmail(ctx, input)
			if sdkErr != nil {
				s.logger.Error("failed to dispatch email via AWS SES SDK",
					"to", recipient,
					"subject", subject,
					"sdk_error", sdkErr,
				)
				return
			}

			s.logger.Info("email dispatched successfully via AWS SES SDK",
				"to", recipient,
				"subject", subject,
			)
		}
	}()
}

func (s *SESService) sendSMTP(recipient, subject, htmlBody, textBody string) error {
	boundary := fmt.Sprintf("boundary-%d", time.Now().UnixNano())
	var msg bytes.Buffer
	msg.WriteString(fmt.Sprintf("From: FellowHire Support <%s>\r\n", s.fromEmail))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", recipient))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", boundary))

	// Text part
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n\r\n")
	msg.WriteString(textBody)
	msg.WriteString("\r\n\r\n")

	// HTML part
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n\r\n")
	msg.WriteString(htmlBody)
	msg.WriteString("\r\n\r\n")
	msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))

	auth := smtp.PlainAuth("", s.smtpUser, s.smtpPass, s.smtpHost)

	addr := s.smtpHost + ":" + s.smtpPort
	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("smtp dial (%s): %w", addr, err)
	}
	defer c.Close()

	tlsConfig := &tls.Config{ServerName: s.smtpHost}
	if err = c.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("smtp starttls: %w", err)
	}

	if err = c.Auth(auth); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}

	if err = c.Mail(s.fromEmail); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}

	if err = c.Rcpt(recipient); err != nil {
		return fmt.Errorf("smtp rcpt to: %w", err)
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}

	if _, err = w.Write(msg.Bytes()); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}

	if err = w.Close(); err != nil {
		return fmt.Errorf("smtp close: %w", err)
	}

	return nil
}

// 1. SendRegistrationEmail
func (s *SESService) SendRegistrationEmail(recipientEmail, userName, companyName, loginURL string) error {
	if loginURL == "" {
		loginURL = s.frontendURL + "/admin/login"
	}
	subject, html, text := buildRegistrationEmail(userName, companyName, loginURL, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 1b. SendCompanyApprovedEmail
func (s *SESService) SendCompanyApprovedEmail(recipientEmail, userName, companyName, loginURL string) error {
	if loginURL == "" {
		loginURL = s.frontendURL + "/admin/login"
	}
	subject, html, text := buildCompanyApprovedEmail(userName, companyName, loginURL, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 2. SendApplicationReceivedEmail
func (s *SESService) SendApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int) error {
	subject, html, text := buildApplicationReceivedEmail(candidateName, programName, trackName, testURL, s.frontendURL, s.supportEmail, durationMinutes, passingScore)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 3. SendLogicTestSubmittedEmail
func (s *SESService) SendLogicTestSubmittedEmail(recipientEmail, candidateName, programName, trackName, resultURL string) error {
	subject, html, text := buildLogicTestSubmittedEmail(candidateName, programName, trackName, resultURL, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 4. SendLogicTestResultEmail
func (s *SESService) SendLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string) error {
	subject, html, text := buildLogicTestResultEmail(candidateName, programName, trackName, score, passingScore, passed, resultURL, actionURL, nextStep, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 5. SendAIInterviewInvitationEmail
func (s *SESService) SendAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time) error {
	subject, html, text := buildAIInterviewInvitationEmail(candidateName, programName, trackName, interviewURL, s.frontendURL, s.supportEmail, expiresAt)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 6. SendFinalInterviewInvitationEmail
func (s *SESService) SendFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string) error {
	if dashboardURL == "" {
		dashboardURL = s.frontendURL + "/candidate/dashboard"
	}
	subject, html, text := buildFinalInterviewInvitationEmail(candidateName, programName, trackName, dashboardURL, notes, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 7. SendAccountActivationEmail
func (s *SESService) SendAccountActivationEmail(recipientEmail, userName, activationURL string) error {
	subject, html, text := buildAccountActivationEmail(userName, activationURL, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// 8. SendAdminInvitationEmail
func (s *SESService) SendAdminInvitationEmail(recipientEmail, inviterName, role, orgName, inviteURL string) error {
	subject, html, text := buildAdminInvitationEmail(inviterName, role, orgName, inviteURL, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// SendCustomApplicationReceivedEmail sends application received email using custom template if configured & enabled, else standard template.
func (s *SESService) SendCustomApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int, customTmpl *model.EmailTemplateConfig) error {
	if customTmpl != nil && customTmpl.Enabled {
		vars := map[string]string{
			"candidate_name":   candidateName,
			"program_name":     programName,
			"track_name":       trackName,
			"test_link":        testURL,
			"action_url":       testURL,
			"duration_minutes": fmt.Sprintf("%d", durationMinutes),
			"passing_score":    fmt.Sprintf("%d", passingScore),
			"support_email":    s.supportEmail,
		}
		subject, html, text := buildCustomEmail(customTmpl, vars, testURL, s.frontendURL, s.supportEmail)
		s.send(recipientEmail, subject, html, text)
		return nil
	}
	return s.SendApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL, durationMinutes, passingScore)
}

// SendCustomLogicTestResultEmail sends logic test result email using custom template if configured & enabled, else standard template.
func (s *SESService) SendCustomLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, actionURL, nextStep string, customTmpl *model.EmailTemplateConfig) error {
	if customTmpl != nil && customTmpl.Enabled {
		vars := map[string]string{
			"candidate_name": candidateName,
			"program_name":   programName,
			"track_name":     trackName,
			"score":          fmt.Sprintf("%d", score),
			"passing_score":  fmt.Sprintf("%d", passingScore),
			"action_url":     actionURL,
			"result_url":     resultURL,
			"next_step":      nextStep,
			"support_email":  s.supportEmail,
		}
		subject, html, text := buildCustomEmail(customTmpl, vars, actionURL, s.frontendURL, s.supportEmail)
		s.send(recipientEmail, subject, html, text)
		return nil
	}
	return s.SendLogicTestResultEmail(recipientEmail, candidateName, programName, trackName, score, passingScore, passed, resultURL, actionURL, nextStep)
}

// SendCustomAIInterviewInvitationEmail sends AI interview invite using custom template if configured & enabled, else standard template.
func (s *SESService) SendCustomAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time, customTmpl *model.EmailTemplateConfig) error {
	if customTmpl != nil && customTmpl.Enabled {
		expiryStr := expiresAt.Format("Monday, January 2, 2006 at 15:04 MST")
		if expiresAt.IsZero() {
			expiryStr = "Within 7 days of this invitation"
		}
		vars := map[string]string{
			"candidate_name": candidateName,
			"program_name":   programName,
			"track_name":     trackName,
			"interview_link": interviewURL,
			"action_url":     interviewURL,
			"expires_at":     expiryStr,
			"support_email":  s.supportEmail,
		}
		subject, html, text := buildCustomEmail(customTmpl, vars, interviewURL, s.frontendURL, s.supportEmail)
		s.send(recipientEmail, subject, html, text)
		return nil
	}
	return s.SendAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL, expiresAt)
}

// SendCustomFinalInterviewInvitationEmail sends final interview invite using custom template if configured & enabled, else standard template.
func (s *SESService) SendCustomFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string, customTmpl *model.EmailTemplateConfig) error {
	if dashboardURL == "" {
		dashboardURL = s.frontendURL + "/candidate/dashboard"
	}
	if customTmpl != nil && customTmpl.Enabled {
		vars := map[string]string{
			"candidate_name": candidateName,
			"program_name":   programName,
			"track_name":     trackName,
			"dashboard_url":  dashboardURL,
			"action_url":     dashboardURL,
			"notes":          notes,
			"support_email":  s.supportEmail,
		}
		subject, html, text := buildCustomEmail(customTmpl, vars, dashboardURL, s.frontendURL, s.supportEmail)
		s.send(recipientEmail, subject, html, text)
		return nil
	}
	return s.SendFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes)
}

// SendRejectionEmail sends rejection notice using custom template if configured & enabled, else standard template.
func (s *SESService) SendRejectionEmail(recipientEmail, candidateName, programName, trackName, notes string, customTmpl *model.EmailTemplateConfig) error {
	if customTmpl != nil && customTmpl.Enabled {
		vars := map[string]string{
			"candidate_name": candidateName,
			"program_name":   programName,
			"track_name":     trackName,
			"notes":          notes,
			"support_email":  s.supportEmail,
		}
		subject, html, text := buildCustomEmail(customTmpl, vars, "", s.frontendURL, s.supportEmail)
		s.send(recipientEmail, subject, html, text)
		return nil
	}
	subject, html, text := buildRejectionEmail(candidateName, programName, trackName, notes, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}

// SendCustomEmail sends an ad-hoc custom email (useful for sending test preview emails).
func (s *SESService) SendCustomEmail(recipientEmail string, customTmpl *model.EmailTemplateConfig, vars map[string]string, actionURL string) error {
	if vars == nil {
		vars = make(map[string]string)
	}
	if _, ok := vars["support_email"]; !ok {
		vars["support_email"] = s.supportEmail
	}
	subject, html, text := buildCustomEmail(customTmpl, vars, actionURL, s.frontendURL, s.supportEmail)
	s.send(recipientEmail, subject, html, text)
	return nil
}


