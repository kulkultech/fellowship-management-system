package server

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/repository"
)

func New(cfg *config.Config, pool *pgxpool.Pool, logger *slog.Logger) http.Handler {
	authSvc := auth.NewService(cfg.JWTSecret, cfg.JWTTTL)

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

	// Handlers
	healthHandler := handler.NewHealthHandler(pool, cfg.AppEnv)
	authHandler := handler.NewAuthHandler(userRepo, orgRepo, authSvc, cfg.JWTTTL, cfg.CookieSecure, cfg.CookieDomain)
	programHandler := handler.NewProgramHandler(orgRepo, programRepo, trackRepo, mcqRepo, applicantRepo, submissionRepo, aiInterviewRepo)
	testHandler := handler.NewTestHandler(submissionRepo, mcqRepo, questionSetRepo, programRepo, trackRepo, applicantRepo, aiInterviewRepo)
	aiInterviewHandler := handler.NewAIInterviewHandler(aiInterviewRepo, applicantRepo, programRepo, trackRepo)
	adminHandler := handler.NewAdminHandler(applicantRepo, submissionRepo, mcqRepo, questionSetRepo, trackRepo, aiInterviewRepo, programRepo, orgRepo)
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

	r := chi.NewRouter()
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

	// Health and probe endpoints (root level)
	r.Get("/health", healthHandler.Health)
	r.Get("/healthz", healthHandler.Liveness)
	r.Get("/livez", healthHandler.Liveness)
	r.Get("/readyz", healthHandler.Readiness)

	if cfg.MetricsToken != "" {
		r.Group(func(m chi.Router) {
			m.Use(middleware.StaticToken(cfg.MetricsToken))
			m.Handle("/metrics", promhttp.Handler())
		})
	}

	r.Route("/api/v1", func(api chi.Router) {
		// Health & Probes
		api.Route("/health", func(h chi.Router) {
			h.Get("/", healthHandler.Health)
			h.Get("/live", healthHandler.Liveness)
			h.Get("/liveness", healthHandler.Liveness)
			h.Get("/ready", healthHandler.Readiness)
			h.Get("/readiness", healthHandler.Readiness)
		})

		// Public Auth & Company Registration
		api.Route("/auth", func(a chi.Router) {
			a.Use(httprate.LimitByIP(30, time.Minute))
			a.Post("/register-company", authHandler.RegisterCompany)
			a.Post("/login", authHandler.Login)
			a.Post("/logout", authHandler.Logout)
			a.Get("/oauth/google", oauthHandler.Start)
			a.Get("/oauth/google/callback", oauthHandler.Callback)
			a.Get("/google", oauthHandler.Start)
			a.Get("/google/callback", oauthHandler.Callback)
		})
		// Candidate Funnel: Program & Registration Intake
		api.Route("/programs", func(p chi.Router) {
			p.Get("/{orgSlug}/{programSlug}", programHandler.GetProgram)
			p.Post("/{orgSlug}/{programSlug}/apply", programHandler.Apply)
			p.Get("/{orgSlug}/{programSlug}/tracks/{trackSlug}", programHandler.GetTrackDetail)
			p.Post("/{orgSlug}/{programSlug}/tracks/{trackSlug}/apply", programHandler.Apply)
		})

		// Candidate Funnel: Timed Logic & MCQ Test
		api.Route("/tests", func(t chi.Router) {
			t.Get("/{testToken}", testHandler.GetTestSession)
			t.Post("/{testToken}/submit", testHandler.SubmitTest)
			t.Get("/{testToken}/result", testHandler.GetResult)
		})

		// Candidate Funnel: AI Interview Room
		api.Route("/interviews", func(ai chi.Router) {
			ai.Get("/{inviteToken}", aiInterviewHandler.GetSession)
			ai.Post("/{inviteToken}/message", aiInterviewHandler.SendMessage)
		})

		// Protected Reviewer / Admin / Superadmin / Candidate Routes
		api.Group(func(protected chi.Router) {
			protected.Use(middleware.Authenticator(authSvc))
			protected.Use(middleware.CSRF)

			protected.Get("/auth/me", authHandler.Me)
			protected.Get("/candidate/applications", candidateHandler.GetCandidateApplications)

			protected.Route("/admin", func(adm chi.Router) {
				// Programs & Config
				adm.Get("/programs", adminHandler.ListPrograms)
				adm.Post("/programs", adminHandler.CreateProgram)
				adm.Put("/programs/{id}/pipeline-config", adminHandler.UpdatePipelineConfig)
				adm.Put("/programs/{id}/stages", adminHandler.UpdateProgramStages)
				adm.Get("/programs/{id}/questions", adminHandler.ListProgramQuestions)
				adm.Put("/programs/{id}/questions", adminHandler.SaveProgramQuestions)

				// Program Tracks
				adm.Get("/programs/{id}/tracks", adminHandler.ListProgramTracks)
				adm.Post("/programs/{id}/tracks", adminHandler.CreateProgramTrack)
				adm.Put("/tracks/{id}", adminHandler.UpdateTrack)
				adm.Delete("/tracks/{id}", adminHandler.DeleteTrack)
				adm.Get("/tracks/{id}/questions", adminHandler.ListTrackQuestions)
				adm.Put("/tracks/{id}/questions", adminHandler.SaveTrackQuestions)

				// Question Sets / Question Banks
				adm.Get("/question-sets", adminHandler.ListQuestionSets)
				adm.Post("/question-sets", adminHandler.CreateQuestionSet)
				adm.Get("/question-sets/{id}", adminHandler.GetQuestionSet)
				adm.Put("/question-sets/{id}", adminHandler.UpdateQuestionSet)
				adm.Delete("/question-sets/{id}", adminHandler.DeleteQuestionSet)
				adm.Post("/question-sets/{id}/duplicate", adminHandler.DuplicateQuestionSet)

				// Applicants & Review
				adm.Get("/applicants", adminHandler.ListApplicants)
				adm.Get("/applicants/{id}", adminHandler.GetApplicantDetail)
				adm.Post("/applicants/{id}/stage", adminHandler.UpdateApplicantStage)

				// Superadmin Company Approvals
				adm.Get("/companies", adminHandler.ListCompanies)
				adm.Post("/companies/{id}/approve", adminHandler.ApproveCompany)
				adm.Post("/companies/{id}/reject", adminHandler.RejectCompany)
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
