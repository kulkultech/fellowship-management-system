package email

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
	"github.com/kulkul/backend/internal/config"
)

type Service interface {
	SendRegistrationEmail(recipientEmail, userName, companyName, loginURL string) error
	SendApplicationReceivedEmail(recipientEmail, candidateName, programName, trackName, testURL string, durationMinutes, passingScore int) error
	SendLogicTestSubmittedEmail(recipientEmail, candidateName, programName, trackName, resultURL string) error
	SendLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, aiInterviewURL string) error
	SendAIInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, interviewURL string, expiresAt time.Time) error
	SendFinalInterviewInvitationEmail(recipientEmail, candidateName, programName, trackName, dashboardURL, notes string) error
}

type SESService struct {
	client       *ses.Client
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
		s.enabled = true
		logger.Info("AWS SES Email Service successfully initialized",
			"region", region,
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
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		if !s.enabled || s.client == nil {
			s.logger.Info("[EMAIL SIMULATION]",
				"to", recipient,
				"subject", subject,
				"from", s.fromEmail,
			)
			return
		}

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

		_, err := s.client.SendEmail(ctx, input)
		if err != nil {
			s.logger.Error("failed to dispatch email via AWS SES",
				"to", recipient,
				"subject", subject,
				"error", err,
			)
			return
		}

		s.logger.Info("email dispatched successfully via AWS SES",
			"to", recipient,
			"subject", subject,
		)
	}()
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
func (s *SESService) SendLogicTestResultEmail(recipientEmail, candidateName, programName, trackName string, score, passingScore int, passed bool, resultURL, aiInterviewURL string) error {
	subject, html, text := buildLogicTestResultEmail(candidateName, programName, trackName, score, passingScore, passed, resultURL, aiInterviewURL, s.frontendURL, s.supportEmail)
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
