package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/repository"
)

// Regression: a company admin signing in through the Candidate Portal must NOT
// lose their organization link and admin role.
func TestFindOrCreateByOAuth_CandidateLoginKeepsCompanyRole(t *testing.T) {
	repo := repository.NewUserRepository(nil)
	ctx := context.Background()

	orgID := uuid.New()
	adminEmail := "boss@acme.co"
	if _, err := repo.Create(ctx, adminEmail, "", "Acme Boss", "org_admin", &orgID); err != nil {
		t.Fatalf("failed to seed company admin: %v", err)
	}

	u, err := repo.FindOrCreateByOAuth(ctx, repository.OAuthIdentity{
		Provider:       "google",
		ProviderUserID: "sub-123",
		Email:          adminEmail,
		Name:           "Acme Boss",
		IsCandidate:    true,
	})
	if err != nil {
		t.Fatalf("candidate-portal login failed: %v", err)
	}
	if u.Role != "org_admin" {
		t.Errorf("expected role org_admin to be preserved, got %q", u.Role)
	}
	if u.OrganizationID == nil || *u.OrganizationID != orgID {
		t.Errorf("expected organization link to be preserved, got %v", u.OrganizationID)
	}
}

func TestFindOrCreateByOAuth_PureCandidateStaysCandidate(t *testing.T) {
	repo := repository.NewUserRepository(nil)
	ctx := context.Background()

	u, err := repo.FindOrCreateByOAuth(ctx, repository.OAuthIdentity{
		Provider:       "google",
		ProviderUserID: "sub-456",
		Email:          "applicant@gmail.com",
		Name:           "Applicant",
		IsCandidate:    true,
	})
	if err != nil {
		t.Fatalf("candidate signup failed: %v", err)
	}
	if u.Role != "candidate" {
		t.Errorf("expected role candidate, got %q", u.Role)
	}
	if u.OrganizationID != nil {
		t.Errorf("expected no organization, got %v", u.OrganizationID)
	}
}
