package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/repository"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := repository.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database for seeding", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	orgRepo := repository.NewOrgRepository(pool)
	userRepo := repository.NewUserRepository(pool)

	logger.Info("Seeding initial assessment platform data...")

	// 1. Organization: RSA
	org, err := orgRepo.Create(ctx, "rsa", "Remote Skills Academy (RSA)", "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=128&h=128&fit=crop")
	if err != nil {
		logger.Error("failed to seed RSA organization", "error", err)
		os.Exit(1)
	}
	logger.Info("Seeded organization", "slug", org.Slug, "name", org.Name)

	// 2. Admin User
	adminPassHash, err := auth.HashPassword("admin123")
	if err != nil {
		logger.Error("failed to hash admin password", "error", err)
		os.Exit(1)
	}
	adminUser, err := userRepo.GetByEmail(ctx, "admin@rsa.org")
	if err != nil {
		adminUser, err = userRepo.Create(ctx, "admin@rsa.org", adminPassHash, "RSA Reviewer Admin", "org_admin", &org.ID)
		if err != nil {
			logger.Error("failed to seed admin user", "error", err)
			os.Exit(1)
		}
	}
	logger.Info("Seeded admin user", "email", adminUser.Email)

	// 3. Seed LIT Assessment Programs & Full Question Banks (QA, Fullstack, SDA)
	if err := repository.SeedLITAssessmentPrograms(ctx, pool, org.ID.String(), logger); err != nil {
		logger.Error("failed to seed LIT assessment programs", "error", err)
		os.Exit(1)
	}

	logger.Info("Database seeding complete!")
}
