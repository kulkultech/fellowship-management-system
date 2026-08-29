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
	applicantRepo := repository.NewApplicantRepository(pool)
	mcqRepo := repository.NewMCQRepository(pool)
	submissionRepo := repository.NewSubmissionRepository(pool)
	aiInterviewRepo := repository.NewAIInterviewRepository(pool)

	// Handlers
	authHandler := handler.NewAuthHandler(userRepo, authSvc, cfg.JWTTTL, cfg.CookieSecure, cfg.CookieDomain)
	programHandler := handler.NewProgramHandler(orgRepo, programRepo, applicantRepo, submissionRepo)
	testHandler := handler.NewTestHandler(submissionRepo, mcqRepo, programRepo, applicantRepo, aiInterviewRepo)
	aiInterviewHandler := handler.NewAIInterviewHandler(aiInterviewRepo, applicantRepo, programRepo)
	adminHandler := handler.NewAdminHandler(applicantRepo, submissionRepo, mcqRepo, aiInterviewRepo, programRepo)

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

	r.Get("/healthz", handler.Healthz)

	if cfg.MetricsToken != "" {
		r.Group(func(m chi.Router) {
			m.Use(middleware.StaticToken(cfg.MetricsToken))
			m.Handle("/metrics", promhttp.Handler())
		})
	}

	r.Route("/api/v1", func(api chi.Router) {
		// Public Auth
		api.Route("/auth", func(a chi.Router) {
			a.Use(httprate.LimitByIP(20, time.Minute))
			a.Post("/login", authHandler.Login)
			a.Post("/logout", authHandler.Logout)
			a.Get("/oauth/google", oauthHandler.Start)
			a.Get("/oauth/google/callback", oauthHandler.Callback)
		})

		// Candidate Funnel: Program & Registration Intake
		api.Route("/programs", func(p chi.Router) {
			p.Get("/{orgSlug}/{programSlug}", programHandler.GetProgram)
			p.Post("/{orgSlug}/{programSlug}/apply", programHandler.Apply)
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

		// Protected Reviewer / Admin Routes
		api.Group(func(protected chi.Router) {
			protected.Use(middleware.Authenticator(authSvc))
			protected.Use(middleware.CSRF)

			protected.Get("/auth/me", authHandler.Me)

			protected.Route("/admin", func(adm chi.Router) {
				adm.Get("/programs", adminHandler.ListPrograms)
				adm.Post("/programs", adminHandler.CreateProgram)
				adm.Put("/programs/{id}", adminHandler.UpdateProgramConfig)
				adm.Get("/applicants", adminHandler.ListApplicants)
				adm.Get("/applicants/{id}", adminHandler.GetApplicantDetails)
				adm.Post("/applicants/{id}/decision", adminHandler.MakeDecision)
			})
		})
	})

	return r
}

func NewLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
}

func Ping(ctx context.Context, pool *pgxpool.Pool) error {
	return pool.Ping(ctx)
}
