package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func setupApplicantDeleteTest() (
	*handler.AdminHandler,
	*handler.CandidateHandler,
	*repository.OrgRepository,
	*repository.ProgramRepository,
	*repository.ApplicantRepository,
	*repository.SubmissionRepository,
	*repository.AIInterviewRepository,
) {
	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	subRepo := repository.NewSubmissionRepository(nil)
	aiRepo := repository.NewAIInterviewRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	mcqRepo := repository.NewMCQRepository(nil)
	qsetRepo := repository.NewQuestionSetRepository(nil)
	userRepo := repository.NewUserRepository(nil)

	adminHandler := handler.NewAdminHandler(
		appRepo,
		subRepo,
		mcqRepo,
		qsetRepo,
		trackRepo,
		aiRepo,
		progRepo,
		orgRepo,
		userRepo,
		nil,
		"https://example.test",
	)

	candidateHandler := handler.NewCandidateHandler(
		orgRepo,
		progRepo,
		trackRepo,
		appRepo,
		subRepo,
		aiRepo,
	)

	return adminHandler, candidateHandler, orgRepo, progRepo, appRepo, subRepo, aiRepo
}

func TestAdminHandler_DeleteApplicant(t *testing.T) {
	adminH, _, orgRepo, progRepo, appRepo, subRepo, aiRepo := setupApplicantDeleteTest()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "alpha-org", "Alpha Org", "admin@alpha.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	prog, err := progRepo.Create(ctx, &model.Program{
		ID:             uuid.New(),
		OrganizationID: org.ID,
		Slug:           "alpha-fellowship",
		Name:           "Alpha Fellowship",
		OpenDate:       time.Now(),
		EndDate:        time.Now().Add(30 * 24 * time.Hour),
		Status:         "published",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// Create test applicant
	applicant, isInserted, err := appRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      prog.ID,
		Email:          "candidate@example.com",
		FullName:       "Alice Candidate",
		CurrentStage:   model.StageTestInProgress,
	})
	if err != nil || !isInserted {
		t.Fatalf("failed to create applicant: %v", err)
	}

	// Create child submission and AI interview
	_, err = subRepo.Create(ctx, applicant.ID, prog.ID, "token-sub-123")
	if err != nil {
		t.Fatalf("failed to create submission: %v", err)
	}
	_, err = aiRepo.CreateInvitation(ctx, applicant.ID, prog.ID, "token-ai-123", time.Now().Add(7*24*time.Hour))
	if err != nil {
		t.Fatalf("failed to create ai interview: %v", err)
	}

	// 1. Cross-org admin should be rejected with 403
	otherOrg, err := orgRepo.Register(ctx, "other-org", "Other Org", "admin@other.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register other org: %v", err)
	}
	rCross := httptest.NewRequest(http.MethodDelete, "/admin/applicants/"+applicant.ID.String(), nil)
	rCrossCtx := middleware.WithUser(rCross.Context(), &auth.Claims{
		UserID:         uuid.New(),
		Role:           model.RoleOrgAdmin,
		OrganizationID: &otherOrg.ID,
		Email:          "other@other.org",
	})
	rctxCross := chi.NewRouteContext()
	rctxCross.URLParams.Add("id", applicant.ID.String())
	rCrossCtx = context.WithValue(rCrossCtx, chi.RouteCtxKey, rctxCross)
	rCross = rCross.WithContext(rCrossCtx)

	wCross := httptest.NewRecorder()
	adminH.DeleteApplicant(wCross, rCross)
	if wCross.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for cross-org delete, got %d", wCross.Code)
	}

	// 2. Org admin belonging to the applicant's organization should succeed (200)
	rSame := httptest.NewRequest(http.MethodDelete, "/admin/applicants/"+applicant.ID.String(), nil)
	rSameCtx := middleware.WithUser(rSame.Context(), &auth.Claims{
		UserID:         uuid.New(),
		Role:           model.RoleOrgAdmin,
		OrganizationID: &org.ID,
		Email:          "admin@alpha.test",
	})
	rctxSame := chi.NewRouteContext()
	rctxSame.URLParams.Add("id", applicant.ID.String())
	rSameCtx = context.WithValue(rSameCtx, chi.RouteCtxKey, rctxSame)
	rSame = rSame.WithContext(rSameCtx)

	wSame := httptest.NewRecorder()
	adminH.DeleteApplicant(wSame, rSame)
	if wSame.Code != http.StatusOK {
		t.Fatalf("expected 200 for same-org delete, got %d (body: %s)", wSame.Code, wSame.Body.String())
	}

	// Verify applicant is gone
	_, err = appRepo.GetByID(ctx, applicant.ID)
	if err != repository.ErrApplicantNotFound {
		t.Fatalf("expected ErrApplicantNotFound, got %v", err)
	}

	// Verify child records are gone
	sub, _ := subRepo.GetByApplicantID(ctx, applicant.ID)
	if sub != nil {
		t.Fatalf("expected submission to be cleaned up, got %v", sub)
	}
	ai, _ := aiRepo.GetByApplicantID(ctx, applicant.ID)
	if ai != nil {
		t.Fatalf("expected ai interview to be cleaned up, got %v", ai)
	}

	// 3. User can now apply again to the same program as a brand new applicant!
	reapplied, isReapplied, err := appRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      prog.ID,
		Email:          "candidate@example.com",
		FullName:       "Alice Candidate Reapplied",
		CurrentStage:   model.StageTestInProgress,
	})
	if err != nil {
		t.Fatalf("failed to reapply: %v", err)
	}
	if !isReapplied {
		t.Fatalf("expected isReapplied to be true, got false")
	}
	if reapplied.ID == applicant.ID {
		t.Fatalf("expected new applicant ID, got same %v", reapplied.ID)
	}
}

func TestCandidateHandler_DeleteCandidateApplication(t *testing.T) {
	_, candH, orgRepo, progRepo, appRepo, subRepo, _ := setupApplicantDeleteTest()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "beta-org", "Beta Org", "admin@beta.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	prog, err := progRepo.Create(ctx, &model.Program{
		ID:             uuid.New(),
		OrganizationID: org.ID,
		Slug:           "beta-fellowship",
		Name:           "Beta Fellowship",
		OpenDate:       time.Now(),
		EndDate:        time.Now().Add(30 * 24 * time.Hour),
		Status:         "published",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	app, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID,
		ProgramID:      prog.ID,
		Email:          "mytest@candidate.com",
		FullName:       "Bob Candidate",
		CurrentStage:   model.StageTestInProgress,
	})
	if err != nil {
		t.Fatalf("failed to create applicant: %v", err)
	}
	_, _ = subRepo.Create(ctx, app.ID, prog.ID, "token-sub-bob")

	// 1. Attempting to delete another candidate's application returns 403
	rHacker := httptest.NewRequest(http.MethodDelete, "/candidate/applications/"+app.ID.String(), nil)
	rHackerCtx := middleware.WithUser(rHacker.Context(), &auth.Claims{
		UserID: uuid.New(),
		Role:   "candidate",
		Email:  "otherguy@candidate.com",
	})
	rctxHacker := chi.NewRouteContext()
	rctxHacker.URLParams.Add("id", app.ID.String())
	rHackerCtx = context.WithValue(rHackerCtx, chi.RouteCtxKey, rctxHacker)
	rHacker = rHacker.WithContext(rHackerCtx)

	wHacker := httptest.NewRecorder()
	candH.DeleteCandidateApplication(wHacker, rHacker)
	if wHacker.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for unauthorized candidate delete, got %d", wHacker.Code)
	}

	// 2. Candidate deleting their own application succeeds with 200
	rOwner := httptest.NewRequest(http.MethodDelete, "/candidate/applications/"+app.ID.String(), nil)
	rOwnerCtx := middleware.WithUser(rOwner.Context(), &auth.Claims{
		UserID: uuid.New(),
		Role:   "candidate",
		Email:  "mytest@candidate.com",
	})
	rctxOwner := chi.NewRouteContext()
	rctxOwner.URLParams.Add("id", app.ID.String())
	rOwnerCtx = context.WithValue(rOwnerCtx, chi.RouteCtxKey, rctxOwner)
	rOwner = rOwner.WithContext(rOwnerCtx)

	wOwner := httptest.NewRecorder()
	candH.DeleteCandidateApplication(wOwner, rOwner)
	if wOwner.Code != http.StatusOK {
		t.Fatalf("expected 200 for owner delete, got %d (body: %s)", wOwner.Code, wOwner.Body.String())
	}

	// Verify applicant is gone
	_, err = appRepo.GetByID(ctx, app.ID)
	if err != repository.ErrApplicantNotFound {
		t.Fatalf("expected ErrApplicantNotFound, got %v", err)
	}
}
