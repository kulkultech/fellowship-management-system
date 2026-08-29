package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dbPool, err := repository.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Warn("database connection failed (proceeding for dev/testing)", "error", err)
	} else {
		defer dbPool.Close()
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
