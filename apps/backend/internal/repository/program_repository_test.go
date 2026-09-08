package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestProgramRepository_UpdateDetails(t *testing.T) {
	repo := repository.NewProgramRepository(nil)
	ctx := context.Background()

	progID := uuid.New()
	created, err := repo.Create(ctx, &model.Program{
		ID:             progID,
		OrganizationID: uuid.New(),
		Slug:           "test-cohort-2026",
		Name:           "Original Cohort Name",
		Description:    "Original description",
		OpenDate:       time.Now().Add(-24 * time.Hour),
		EndDate:        time.Now().Add(7 * 24 * time.Hour),
		Status:         "published",
	})
	if err != nil {
		t.Fatalf("unexpected error creating program: %v", err)
	}
	if created.Name != "Original Cohort Name" {
		t.Errorf("expected name 'Original Cohort Name', got '%s'", created.Name)
	}

	// Update details
	updated, err := repo.UpdateDetails(ctx, progID, "Renamed Fellowship 2026", "Updated description text")
	if err != nil {
		t.Fatalf("unexpected error updating details: %v", err)
	}
	if updated.Name != "Renamed Fellowship 2026" {
		t.Errorf("expected name 'Renamed Fellowship 2026', got '%s'", updated.Name)
	}
	if updated.Description != "Updated description text" {
		t.Errorf("expected description 'Updated description text', got '%s'", updated.Description)
	}

	// Verify persistence in repository
	fetched, err := repo.GetByID(ctx, progID)
	if err != nil {
		t.Fatalf("unexpected error fetching program: %v", err)
	}
	if fetched.Name != "Renamed Fellowship 2026" {
		t.Errorf("expected fetched name 'Renamed Fellowship 2026', got '%s'", fetched.Name)
	}
	if fetched.Description != "Updated description text" {
		t.Errorf("expected fetched description 'Updated description text', got '%s'", fetched.Description)
	}
}
