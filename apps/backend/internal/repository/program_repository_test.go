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
	newOpen := time.Now().Add(24 * time.Hour)
	newEnd := time.Now().Add(30 * 24 * time.Hour)
	newImage := "https://example.com/banner.png"
	updated, err := repo.UpdateDetails(ctx, progID, "Renamed Fellowship 2026", "Updated description text", newImage, &newOpen, &newEnd, "draft")
	if err != nil {
		t.Fatalf("unexpected error updating details: %v", err)
	}
	if updated.Name != "Renamed Fellowship 2026" {
		t.Errorf("expected name 'Renamed Fellowship 2026', got '%s'", updated.Name)
	}
	if updated.Description != "Updated description text" {
		t.Errorf("expected description 'Updated description text', got '%s'", updated.Description)
	}
	if updated.ImageURL != newImage {
		t.Errorf("expected image '%s', got '%s'", newImage, updated.ImageURL)
	}
	if updated.Status != "draft" {
		t.Errorf("expected status 'draft', got '%s'", updated.Status)
	}
	if updated.PreviewToken == uuid.Nil {
		t.Errorf("expected valid preview_token, got nil")
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
	if fetched.ImageURL != newImage {
		t.Errorf("expected fetched image '%s', got '%s'", newImage, fetched.ImageURL)
	}
	if fetched.Status != "draft" {
		t.Errorf("expected fetched status 'draft', got '%s'", fetched.Status)
	}
}

func TestProgramRepository_CreateAndUpdatePipeline_WithQuestionSet(t *testing.T) {
	repo := repository.NewProgramRepository(nil)
	ctx := context.Background()

	progID := uuid.New()
	qSetID := uuid.New()
	created, err := repo.Create(ctx, &model.Program{
		ID:                       progID,
		OrganizationID:           uuid.New(),
		QuestionSetID:            &qSetID,
		Slug:                     "trackless-logic-test-cohort",
		Name:                     "Trackless Logic Cohort 2026",
		EnableMCQ:                true,
		LogicTestDurationMinutes: 45,
		LogicTestPassingScore:    75,
		Status:                   "published",
	})
	if err != nil {
		t.Fatalf("unexpected error creating program: %v", err)
	}
	if created.QuestionSetID == nil || *created.QuestionSetID != qSetID {
		t.Fatalf("expected question set id %v, got %v", qSetID, created.QuestionSetID)
	}

	// Update pipeline to a new question set
	newQSetID := uuid.New()
	updated, err := repo.UpdatePipeline(ctx, progID, &newQSetID, true, false, "Instructions", []string{"Q1"})
	if err != nil {
		t.Fatalf("unexpected error updating pipeline: %v", err)
	}
	if updated.QuestionSetID == nil || *updated.QuestionSetID != newQSetID {
		t.Fatalf("expected updated question set id %v, got %v", newQSetID, updated.QuestionSetID)
	}
	if !updated.EnableMCQ {
		t.Errorf("expected enable_mcq true")
	}
	if updated.EnableAIInterview {
		t.Errorf("expected enable_ai_interview false")
	}

	// Fetch back
	fetched, err := repo.GetByID(ctx, progID)
	if err != nil {
		t.Fatalf("unexpected error fetching program: %v", err)
	}
	if fetched.QuestionSetID == nil || *fetched.QuestionSetID != newQSetID {
		t.Fatalf("expected fetched question set id %v, got %v", newQSetID, fetched.QuestionSetID)
	}
}

func TestProgramRepository_Delete(t *testing.T) {
	repo := repository.NewProgramRepository(nil)
	ctx := context.Background()

	orgID := uuid.New()
	progID := uuid.New()

	_, err := repo.Create(ctx, &model.Program{
		ID:             progID,
		OrganizationID: orgID,
		Slug:           "deletable-program",
		Name:           "Deletable Program",
	})
	if err != nil {
		t.Fatalf("unexpected create error: %v", err)
	}

	// 1. Delete with non-existent ID fails
	if err := repo.Delete(ctx, uuid.New(), uuid.Nil); err != repository.ErrProgramNotFound {
		t.Errorf("expected ErrProgramNotFound, got %v", err)
	}

	// 2. Delete with matching ID succeeds
	if err := repo.Delete(ctx, progID, uuid.Nil); err != nil {
		t.Fatalf("unexpected delete error: %v", err)
	}

	// 3. Confirm program is gone
	if _, err := repo.GetByID(ctx, progID); err != repository.ErrProgramNotFound {
		t.Errorf("expected ErrProgramNotFound after deletion, got %v", err)
	}
}

