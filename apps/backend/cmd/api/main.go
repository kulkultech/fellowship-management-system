package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/internal/server"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server fatal", slog.Any("error", err))
		os.Exit(1)
	}
}

func run() error {
	logger := server.NewLogger()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	if cfg.SentryDSN != "" && cfg.SentryDSN != "none" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			Environment:      cfg.AppEnv,
			EnableTracing:    true,
			TracesSampleRate: 0.25,
		}); err != nil {
			logger.Warn("sentry.Init failed", slog.Any("error", err))
		} else {
			defer sentry.Flush(2 * time.Second)
			logger.Info("Sentry crash analytics and tracing (25%) initialized successfully", slog.String("env", cfg.AppEnv))
		}
	} else {
		logger.Warn("Sentry DSN not configured, crash analytics disabled (set SENTRY_DSN in deployment environment)")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var dbPool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		var pool *pgxpool.Pool
		var err error
		maxRetries := 5
		for attempt := 1; attempt <= maxRetries; attempt++ {
			pool, err = repository.NewPool(ctx, cfg.DatabaseURL)
			if err == nil {
				break
			}
			logger.Warn("database connection attempt failed", "attempt", attempt, "max_retries", maxRetries, "error", err)
			if attempt < maxRetries {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(time.Duration(attempt) * time.Second):
				}
			}
		}

		if err != nil {
			if cfg.AppEnv == "production" {
				if cfg.SentryDSN != "" {
					sentry.CaptureException(fmt.Errorf("fatal: database connection failed in production after %d attempts: %w", maxRetries, err))
					sentry.Flush(2 * time.Second)
				}
				return fmt.Errorf("fatal: database connection failed in production: %w", err)
			}
			logger.Warn("database connection failed (falling back to in-memory store for dev)", "error", err)
		} else {
			dbPool = pool
			defer dbPool.Close()

			if err := repository.AutoMigrateAndSeed(ctx, dbPool, logger); err != nil {
				logger.Error("database auto-migration failed", "error", err)
				if cfg.SentryDSN != "" {
					sentry.CaptureException(fmt.Errorf("database auto-migration failed: %w", err))
				}
			}
		}
	}

	handler := server.New(cfg, dbPool, logger)

	srv := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("Assessment Platform API server listening", slog.String("port", cfg.HTTPPort), slog.String("env", cfg.AppEnv))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("listen failed", slog.Any("error", err))
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	return nil
}
