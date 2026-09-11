package repository_test

import (
	"context"
	"testing"

	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestOrgRepository_UpdateSlug(t *testing.T) {
	repo := repository.NewOrgRepository(nil)
	ctx := context.Background()

	created, err := repo.Register(ctx, "initial-slug", "Initial Company", "contact@initial.com", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to create organization: %v", err)
	}
	if created.Slug != "initial-slug" {
		t.Fatalf("expected slug 'initial-slug', got '%s'", created.Slug)
	}
	orgID := created.ID

	// 1. Update slug to a new valid slug
	updated, err := repo.Update(ctx, orgID, "custom-tech-slug", "Renamed Company", "new@tech.com", "https://logo.png")
	if err != nil {
		t.Fatalf("failed to update organization slug: %v", err)
	}
	if updated.Slug != "custom-tech-slug" {
		t.Errorf("expected slug 'custom-tech-slug', got '%s'", updated.Slug)
	}
	if updated.Name != "Renamed Company" {
		t.Errorf("expected name 'Renamed Company', got '%s'", updated.Name)
	}

	// 2. Lookup by new slug succeeds
	bySlug, err := repo.GetBySlug(ctx, "custom-tech-slug")
	if err != nil {
		t.Fatalf("failed to fetch by new slug: %v", err)
	}
	if bySlug.ID != orgID {
		t.Errorf("expected org ID %v, got %v", orgID, bySlug.ID)
	}

	// 3. Old slug no longer exists
	if _, err := repo.GetBySlug(ctx, "initial-slug"); err != repository.ErrOrgNotFound {
		t.Errorf("expected ErrOrgNotFound for old slug, got %v", err)
	}

	// 4. Create second org and ensure updating to conflicting slug fails
	second, err := repo.Register(ctx, "second-company", "Second Company", "second@company.com", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to create second org: %v", err)
	}

	// Try setting second org's slug to "custom-tech-slug"
	_, err = repo.Update(ctx, second.ID, "custom-tech-slug", "Conflict Name", "", "")
	if err == nil {
		t.Errorf("expected error updating to duplicate slug, got nil")
	}
}
