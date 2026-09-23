package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestMentorFlow_EndToEnd(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	invRepo := repository.NewInvitationRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	authSvc := auth.NewService("test-secret-at-least-32-bytes-long", time.Hour)

	// 1. Setup Org & Program
	org, err := orgRepo.Register(ctx, "acme-mentor-corp", "Acme Mentor Tech", "contact@acme-mentor-corp.org", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	admin, err := userRepo.Create(ctx, "lead_admin@acme-mentor-corp.org", "passhash", "Admin User", model.RoleOrgAdmin, &org.ID)
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}

	prog, err := programRepo.Create(ctx, &model.Program{
		OrganizationID:           org.ID,
		Slug:                     "lit-2026",
		Name:                     "LIT 2026 Fellowship",
		Description:              "Description",
		LogicTestDurationMinutes: 30,
		LogicTestPassingScore:    70,
		AllowRetake:              false,
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// Handlers
	admHandler := handler.NewAdminHandler(applicantRepo, nil, nil, nil, nil, nil, programRepo, orgRepo, userRepo, nil, "http://localhost:5173")
	admHandler.SetInvitationRepo(invRepo)
	admHandler.SetMentorRepo(mentorRepo)

	authHandler := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "", "http://localhost:5173")
	authHandler.SetInvitationRepo(invRepo)
	authHandler.SetMentorRepo(mentorRepo)

	mentorHandler := handler.NewMentorHandler(mentorRepo, userRepo, programRepo, applicantRepo)

	// 2. Admin invites a Mentor with program_id
	t.Run("Admin invites Mentor with program assignment", func(t *testing.T) {
		progIDStr := prog.ID.String()
		payload := handler.CreateInvitationRequest{
			Email:     "mentor1@acme.org",
			Role:      model.RoleMentor,
			ProgramID: &progIDStr,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		claims := &auth.Claims{
			UserID:         admin.ID,
			Email:          admin.Email,
			Role:           admin.Role,
			OrganizationID: &org.ID,
		}
		req = req.WithContext(middleware.WithUser(req.Context(), claims))

		rec := httptest.NewRecorder()
		admHandler.CreateInvitation(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected status 201, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		invMap := resp["invitation"].(map[string]any)
		if invMap["role"] != model.RoleMentor {
			t.Errorf("expected role mentor, got %v", invMap["role"])
		}
	})

	// 3. Mentor accepts invitation
	var mentorUser *model.User
	t.Run("Mentor accepts invitation and gets assigned to program", func(t *testing.T) {
		invs, err := invRepo.ListByOrganization(ctx, org.ID)
		if err != nil || len(invs) == 0 {
			t.Fatalf("failed to find invitation: %v", err)
		}
		inv := invs[0]

		acceptPayload := map[string]string{
			"name":     "Master Mentor",
			"password": "Password123!",
		}
		body, _ := json.Marshal(acceptPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/invitations/"+inv.Token+"/accept", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("token", inv.Token)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

		rec := httptest.NewRecorder()
		authHandler.AcceptInvitation(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp["redirect_url"] != "/mentor/dashboard" {
			t.Errorf("expected redirect_url == /mentor/dashboard, got %v", resp["redirect_url"])
		}

		mentorUser, err = userRepo.GetByEmail(ctx, "mentor1@acme.org")
		if err != nil || mentorUser == nil {
			t.Fatalf("mentor user not created: %v", err)
		}
		if mentorUser.Role != model.RoleMentor {
			t.Errorf("expected role mentor, got %s", mentorUser.Role)
		}

		// Verify program assignment
		isMentor, err := mentorRepo.IsMentorOfProgram(ctx, mentorUser.ID, prog.ID)
		if err != nil || !isMentor {
			t.Errorf("expected user to be assigned as mentor of program, got %v", err)
		}
	})

	// 4. Mentor views their programs & fellows
	t.Run("Mentor views programs and fellow roster", func(t *testing.T) {
		// Create a fellow in the program
		_, _, err := applicantRepo.CreateOrGet(ctx, &model.Applicant{
			OrganizationID: org.ID,
			ProgramID:      prog.ID,
			Email:          "fellow@student.edu",
			FullName:       "Alice Fellow",
			CurrentStage:   model.StageApprovedForLive,
			FormSubmitted:  true,
		})
		if err != nil {
			t.Fatalf("failed to create fellow: %v", err)
		}

		mentorClaims := &auth.Claims{
			UserID:         mentorUser.ID,
			Email:          mentorUser.Email,
			Role:           mentorUser.Role,
			OrganizationID: &org.ID,
		}

		// GET /mentor/programs
		reqProg := httptest.NewRequest(http.MethodGet, "/api/v1/mentor/programs", nil)
		reqProg = reqProg.WithContext(middleware.WithUser(reqProg.Context(), mentorClaims))
		recProg := httptest.NewRecorder()
		mentorHandler.ListPrograms(recProg, reqProg)

		if recProg.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", recProg.Code, recProg.Body.String())
		}

		// GET /mentor/programs/{id}/fellows
		reqFellows := httptest.NewRequest(http.MethodGet, "/api/v1/mentor/programs/"+prog.ID.String()+"/fellows", nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", prog.ID.String())
		reqFellows = reqFellows.WithContext(context.WithValue(reqFellows.Context(), chi.RouteCtxKey, rctx))
		reqFellows = reqFellows.WithContext(middleware.WithUser(reqFellows.Context(), mentorClaims))

		recFellows := httptest.NewRecorder()
		mentorHandler.ListFellows(recFellows, reqFellows)

		if recFellows.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", recFellows.Code, recFellows.Body.String())
		}

		var fellowsResp map[string]any
		_ = json.Unmarshal(recFellows.Body.Bytes(), &fellowsResp)
		count := int(fellowsResp["count"].(float64))
		if count != 1 {
			t.Errorf("expected 1 fellow, got %d", count)
		}
	})

	// 5. Admin can assign and remove mentors
	t.Run("Admin assigns and removes program mentor", func(t *testing.T) {
		mentor2, err := userRepo.Create(ctx, "mentor2@acme.org", "passhash", "Mentor Two", model.RoleMentor, &org.ID)
		if err != nil {
			t.Fatalf("failed to create mentor2: %v", err)
		}

		assignPayload := map[string]string{
			"user_id":    mentor2.ID.String(),
			"role_title": "Senior AI Mentor",
			"bio":        "AI and Cloud specialist",
		}
		body, _ := json.Marshal(assignPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/programs/"+prog.ID.String()+"/mentors", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", prog.ID.String())
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

		rec := httptest.NewRecorder()
		admHandler.AssignProgramMentor(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		// Verify listed
		mentors, err := mentorRepo.ListMentorsByProgram(ctx, prog.ID)
		if err != nil || len(mentors) < 2 {
			t.Fatalf("expected at least 2 mentors, got %d: %v", len(mentors), err)
		}

		// Remove mentor2
		reqRem := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/programs/"+prog.ID.String()+"/mentors/"+mentor2.ID.String(), nil)
		rctxRem := chi.NewRouteContext()
		rctxRem.URLParams.Add("id", prog.ID.String())
		rctxRem.URLParams.Add("userId", mentor2.ID.String())
		reqRem = reqRem.WithContext(context.WithValue(reqRem.Context(), chi.RouteCtxKey, rctxRem))

		recRem := httptest.NewRecorder()
		admHandler.RemoveProgramMentor(recRem, reqRem)
		if recRem.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", recRem.Code, recRem.Body.String())
		}

		isM2, _ := mentorRepo.IsMentorOfProgram(ctx, mentor2.ID, prog.ID)
		if isM2 {
			t.Errorf("expected mentor2 to be removed from program")
		}
	})
}
