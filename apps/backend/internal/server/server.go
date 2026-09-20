package server

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/kulkul/backend/internal/ai"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/email"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/pkg/storage"
)

func New(cfg *config.Config, pool *pgxpool.Pool, logger *slog.Logger) http.Handler {
	authSvc := auth.NewService(cfg.JWTSecret, cfg.JWTTTL)

	// Email Service (AWS SES)
	emailSvc := email.NewService(cfg.SES, logger)

	// Repositories
	userRepo := repository.NewUserRepository(pool)
	orgRepo := repository.NewOrgRepository(pool)
	programRepo := repository.NewProgramRepository(pool)
	trackRepo := repository.NewTrackRepository(pool)
	applicantRepo := repository.NewApplicantRepository(pool)
	mcqRepo := repository.NewMCQRepository(pool)
	questionSetRepo := repository.NewQuestionSetRepository(pool)
	submissionRepo := repository.NewSubmissionRepository(pool)
	aiInterviewRepo := repository.NewAIInterviewRepository(pool)

	// AI Evaluator
	aiEvaluator := ai.NewCloudflareEvaluator(cfg.Cloudflare, logger)

	// Storage Service (Cloudflare R2 with Local fallback)
	store, err := storage.New(cfg.Storage)
	if err != nil {
		logger.Error("failed to initialize storage provider, falling back to local", slog.Any("error", err))
		store, _ = storage.NewLocalStorage(cfg.Storage.LocalPath)
	}

	// Handlers
	invitationRepo := repository.NewInvitationRepository(pool)
	healthHandler := handler.NewHealthHandler(pool, cfg.AppEnv)
	authHandler := handler.NewAuthHandler(userRepo, orgRepo, authSvc, emailSvc, cfg.JWTTTL, cfg.CookieSecure, cfg.CookieDomain, cfg.SES.FrontendURL)
	authHandler.SetInvitationRepo(invitationRepo)
	programHandler := handler.NewProgramHandler(orgRepo, programRepo, trackRepo, mcqRepo, applicantRepo, submissionRepo, aiInterviewRepo, userRepo, emailSvc, cfg.SES.FrontendURL)
	testHandler := handler.NewTestHandler(submissionRepo, mcqRepo, questionSetRepo, programRepo, trackRepo, applicantRepo, aiInterviewRepo, orgRepo, emailSvc, cfg.SES.FrontendURL)
	aiInterviewHandler := handler.NewAIInterviewHandler(aiInterviewRepo, applicantRepo, programRepo, trackRepo, aiEvaluator, store)
	uploadHandler := handler.NewUploadHandler(store, logger)
	adminHandler := handler.NewAdminHandler(applicantRepo, submissionRepo, mcqRepo, questionSetRepo, trackRepo, aiInterviewRepo, programRepo, orgRepo, userRepo, emailSvc, cfg.SES.FrontendURL)
	adminHandler.SetInvitationRepo(invitationRepo)
	candidateHandler := handler.NewCandidateHandler(orgRepo, programRepo, trackRepo, applicantRepo, submissionRepo, aiInterviewRepo)

	var googleOAuth *auth.GoogleOAuth
	if cfg.GoogleOAuth.Enabled() {
		googleOAuth = auth.NewGoogleOAuth(
			cfg.GoogleOAuth.ClientID,
			cfg.GoogleOAuth.ClientSecret,
			cfg.GoogleOAuth.RedirectURL,
		)
	}
	oauthHandler := handler.NewOAuthHandler(
		googleOAuth,
		userRepo,
		authSvc,
		cfg.JWTTTL,
		cfg.CookieSecure,
		cfg.CookieDomain,
		cfg.GoogleOAuth.FrontendSuccessURL,
		logger,
	)

	sentryHandler := sentryhttp.New(sentryhttp.Options{
		Repanic: true,
	})

	r := chi.NewRouter()
	r.Use(sentryHandler.Handle)
	r.Use(middleware.RequestID)
	r.Use(middleware.Recover(logger))
	r.Use(middleware.Logger(logger))
	r.Use(middleware.SecurityHeaders)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-CSRF-Token", middleware.RequestIDHeader},
		ExposedHeaders:   []string{middleware.RequestIDHeader},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	sentryTestHandler := func(w http.ResponseWriter, r *http.Request) {
		if cfg.SentryDSN == "" {
			httpx.JSON(w, http.StatusOK, map[string]any{
				"status":  "disabled",
				"message": "Sentry is not configured. Set SENTRY_DSN in your deployment environment to enable.",
			})
			return
		}
		eventID := sentry.CaptureMessage("FellowHire Backend Sentry Connection Test")
		sentry.Flush(2 * time.Second)
		eventIDStr := ""
		if eventID != nil {
			eventIDStr = string(*eventID)
		}
		httpx.JSON(w, http.StatusOK, map[string]any{
			"status":   "connected",
			"message":  "Test event sent to Sentry successfully!",
			"event_id": eventIDStr,
			"env":      cfg.AppEnv,
		})
	}

	// Health and probe endpoints (root level)
	r.Get("/health", healthHandler.Health)
	r.Get("/healthz", healthHandler.Liveness)
	r.Get("/livez", healthHandler.Liveness)
	r.Get("/readyz", healthHandler.Readiness)
	r.Get("/health/sentry-test", sentryTestHandler)

	if cfg.MetricsToken != "" {
		r.Group(func(m chi.Router) {
			m.Use(middleware.StaticToken(cfg.MetricsToken))
			m.Handle("/metrics", promhttp.Handler())
		})
	}

	workDir, _ := os.Getwd()
	uploadsDir := filepath.Join(workDir, "uploads")
	_ = os.MkdirAll(uploadsDir, 0755)

	// Unified media streaming & serving routes (Cloudflare R2 with local fallback)
	r.Get("/uploads/proxy", uploadHandler.ProxyRemoteMedia)
	r.Get("/uploads/*", uploadHandler.ServeMedia)
	r.Head("/uploads/*", uploadHandler.ServeMedia)
	r.Post("/uploads", uploadHandler.Upload)

	r.Route("/api/v1", func(api chi.Router) {
		// Health & Probes
		api.Route("/health", func(h chi.Router) {
			h.Get("/", healthHandler.Health)
			h.Get("/live", healthHandler.Liveness)
			h.Get("/liveness", healthHandler.Liveness)
			h.Get("/ready", healthHandler.Readiness)
			h.Get("/readiness", healthHandler.Readiness)
			h.Get("/sentry-test", sentryTestHandler)
		})

		// Public Media Upload & Streaming (Cloudflare R2)
		api.Route("/uploads", func(u chi.Router) {
			u.Post("/", uploadHandler.Upload)
			u.Get("/proxy", uploadHandler.ProxyRemoteMedia)
			u.Get("/*", uploadHandler.ServeMedia)
			u.Head("/*", uploadHandler.ServeMedia)
		})

		// Public Auth, Candidate/Company Registration & Activation
		api.Route("/auth", func(a chi.Router) {
			a.Use(httprate.LimitByIP(30, time.Minute))
			a.Post("/register-candidate", authHandler.RegisterCandidate)
			a.Post("/register-company", authHandler.RegisterCompany)
			a.Post("/activate", authHandler.ActivateAccount)
			a.Get("/activate", authHandler.ActivateAccount)
			a.Post("/resend-activation", authHandler.ResendActivation)
			a.Post("/login", authHandler.Login)
			a.Post("/logout", authHandler.Logout)
			a.Get("/invitations/{token}", authHandler.GetInvitation)
			a.Post("/invitations/{token}/accept", authHandler.AcceptInvitation)
			a.Get("/oauth/google", oauthHandler.Start)
			a.Get("/oauth/google/callback", oauthHandler.Callback)
			a.Get("/google", oauthHandler.Start)
			a.Get("/google/callback", oauthHandler.Callback)
		})
		// Candidate Funnel: Program & Registration Intake
		api.Route("/programs", func(p chi.Router) {
			p.Use(middleware.OptionalAuthenticator(authSvc))
			p.Get("/{orgSlug}/{programSlug}", programHandler.GetProgram)
			p.Get("/{orgSlug}/{programSlug}/candidate-status", programHandler.GetCandidateStatus)
			p.Post("/{orgSlug}/{programSlug}/start", programHandler.StartProgram)
			p.Post("/{orgSlug}/{programSlug}/apply", programHandler.Apply)
			p.Get("/{orgSlug}/{programSlug}/tracks/{trackSlug}", programHandler.GetTrackDetail)
			p.Post("/{orgSlug}/{programSlug}/tracks/{trackSlug}/apply", programHandler.Apply)
		})

		// Candidate Funnel: Timed Logic & MCQ Test
		api.Route("/tests", func(t chi.Router) {
			t.Get("/{testToken}", testHandler.GetTestSession)
			t.Post("/{testToken}/start", testHandler.StartTest)
			t.Post("/{testToken}/submit", testHandler.SubmitTest)
			t.Get("/{testToken}/result", testHandler.GetResult)
		})

		// Candidate Funnel: AI Interview Room
		api.Route("/interviews", func(ai chi.Router) {
			ai.Post("/tts", aiInterviewHandler.SynthesizeSpeech)
			ai.Post("/transcribe", aiInterviewHandler.TranscribeSpeech)
			ai.Get("/{inviteToken}", aiInterviewHandler.GetSession)
			ai.Post("/{inviteToken}/message", aiInterviewHandler.SendMessage)
			ai.Post("/{inviteToken}/presign-recording", aiInterviewHandler.PresignRecordingUpload)
			ai.Post("/{inviteToken}/recording", aiInterviewHandler.UploadRecording)
			ai.Post("/{inviteToken}/reset", aiInterviewHandler.ResetSession)
			ai.Post("/{inviteToken}/tts", aiInterviewHandler.SynthesizeSpeech)
			ai.Post("/{inviteToken}/transcribe", aiInterviewHandler.TranscribeSpeech)
		})


		// Protected Reviewer / Admin / Superadmin / Candidate Routes
		api.Group(func(protected chi.Router) {
			protected.Use(middleware.Authenticator(authSvc))
			protected.Use(middleware.CSRF)

			protected.Get("/auth/me", authHandler.Me)
			protected.Put("/auth/profile", authHandler.UpdateProfile)
			protected.Get("/candidate/applications", candidateHandler.GetCandidateApplications)
			protected.Delete("/candidate/applications/{id}", candidateHandler.DeleteCandidateApplication)

			protected.Route("/admin", func(adm chi.Router) {
				// Require org_admin or reviewer (superadmin auto-allowed)
				adm.Use(middleware.RequireRole("org_admin", "reviewer"))

				// Programs & Config
				adm.Get("/programs", adminHandler.ListPrograms)
				adm.Post("/programs", adminHandler.CreateProgram)
				adm.Put("/programs/{id}", adminHandler.UpdateProgramDetails)
				adm.Delete("/programs/{id}", adminHandler.DeleteProgram)
				adm.Put("/programs/{id}/pipeline-config", adminHandler.UpdatePipelineConfig)
				adm.Put("/programs/{id}/candidate-flow", adminHandler.UpdateCandidateFlow)
				adm.Put("/programs/{id}/rubric", adminHandler.UpdateProgramRubric)
				adm.Put("/programs/{id}/stages", adminHandler.UpdateProgramStages)
				adm.Put("/programs/{id}/form", adminHandler.UpdateProgramFormSchema)
				adm.Get("/programs/{id}/email-templates", adminHandler.GetProgramEmailTemplates)
				adm.Put("/programs/{id}/email-templates", adminHandler.UpdateProgramEmailTemplates)
				adm.Post("/programs/{id}/email-templates/test", adminHandler.SendTestProgramEmail)
				adm.Get("/programs/{id}/questions", adminHandler.ListProgramQuestions)
				adm.Put("/programs/{id}/questions", adminHandler.SaveProgramQuestions)

				// Program Tracks
				adm.Get("/programs/{id}/tracks", adminHandler.ListProgramTracks)
				adm.Post("/programs/{id}/tracks", adminHandler.CreateProgramTrack)
				adm.Put("/tracks/{id}", adminHandler.UpdateTrack)
				adm.Put("/tracks/{id}/rubric", adminHandler.UpdateTrackRubric)
				adm.Delete("/tracks/{id}", adminHandler.DeleteTrack)
				adm.Get("/tracks/{id}/questions", adminHandler.ListTrackQuestions)
				adm.Put("/tracks/{id}/questions", adminHandler.SaveTrackQuestions)

				// Question Sets / Question Banks
				adm.Get("/question-sets", adminHandler.ListQuestionSets)
				adm.Post("/question-sets", adminHandler.CreateQuestionSet)
				adm.Post("/question-sets/import-csv", adminHandler.CreateQuestionSetFromCSV)
				adm.Get("/question-sets/{id}", adminHandler.GetQuestionSet)
				adm.Put("/question-sets/{id}", adminHandler.UpdateQuestionSet)
				adm.Delete("/question-sets/{id}", adminHandler.DeleteQuestionSet)
				adm.Post("/question-sets/{id}/duplicate", adminHandler.DuplicateQuestionSet)
				adm.Post("/question-sets/{id}/import-csv", adminHandler.ImportQuestionSetCSV)

				// Applicants & Review
				adm.Get("/applicants", adminHandler.ListApplicants)
				adm.Get("/applicants/{id}", adminHandler.GetApplicantDetail)
				adm.Post("/applicants/{id}/stage", adminHandler.UpdateApplicantStage)
				adm.Delete("/applicants/{id}", adminHandler.DeleteApplicant)

				// Superadmin Exclusive: Company Approvals
				adm.Group(func(super chi.Router) {
					super.Use(middleware.RequireRole("superadmin"))
					super.Get("/companies", adminHandler.ListCompanies)
					super.Post("/companies/{id}/approve", adminHandler.ApproveCompany)
					super.Post("/companies/{id}/reject", adminHandler.RejectCompany)
					super.Put("/companies/{id}", adminHandler.UpdateCompanyDetails)
					super.Delete("/companies/{id}", adminHandler.DeleteCompany)
					super.Get("/users/lookup", adminHandler.LookupUser)
					super.Post("/users/relink", adminHandler.RelinkUser)
				})

				// Organization Profile
				adm.Get("/organization", adminHandler.GetCurrentOrganization)
				adm.Put("/organization", adminHandler.UpdateOrganization)

				// Team Management & Admin Invitations
				adm.Get("/team", adminHandler.GetTeam)
				adm.Post("/invitations", adminHandler.CreateInvitation)
				adm.Delete("/invitations/{id}", adminHandler.RevokeInvitation)
				adm.Post("/invitations/{id}/resend", adminHandler.ResendInvitation)
				adm.Delete("/members/{id}", adminHandler.RemoveMember)
			})
		})
	})

	// Direct API prefix aliases for ingress / OAuth compatibility (/api/auth/...)
	r.Route("/api/auth", func(a chi.Router) {
		a.Use(httprate.LimitByIP(30, time.Minute))
		a.Get("/oauth/google", oauthHandler.Start)
		a.Get("/oauth/google/callback", oauthHandler.Callback)
		a.Get("/google", oauthHandler.Start)
		a.Get("/google/callback", oauthHandler.Callback)
	})

	return r
}

func NewLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
}

func Ping(ctx context.Context, pool *pgxpool.Pool) error {
	return pool.Ping(ctx)
}
