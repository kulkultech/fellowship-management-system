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
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func setupTestInvitationEnv(t *testing.T) (*handler.AdminHandler, *handler.AuthHandler, *repository.UserRepository, *repository.OrgRepository, *repository.InvitationRepository, *auth.Service, uuid.UUID) {
	t.Helper()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	invRepo := repository.NewInvitationRepository(nil)
	authSvc := auth.NewService("test-secret-at-least-32-bytes-long", time.Hour)

	// Create test org
	org, err := orgRepo.Register(context.Background(), "test-org", "Test Organization", "admin@testorg.com", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to create test org: %v", err)
	}

	admHandler := handler.NewAdminHandler(nil, nil, nil, nil, nil, nil, nil, orgRepo, userRepo, nil, "http://localhost:5173")
	admHandler.SetInvitationRepo(invRepo)

	authHandler := handler.NewAuthHandler(userRepo, orgRepo, authSvc, nil, time.Hour, false, "", "http://localhost:5173")
	authHandler.SetInvitationRepo(invRepo)

	return admHandler, authHandler, userRepo, orgRepo, invRepo, authSvc, org.ID
}

func TestAdminHandler_OrgAdminInvite(t *testing.T) {
	admHandler, _, userRepo, _, invRepo, _, orgID := setupTestInvitationEnv(t)

	// Create caller org_admin
	caller, err := userRepo.Create(context.Background(), "primaryadmin@testorg.com", "hash", "Primary Admin", model.RoleOrgAdmin, &orgID)
	if err != nil {
		t.Fatalf("failed to create caller: %v", err)
	}

	claims := &auth.Claims{
		UserID:         caller.ID,
		Email:          caller.Email,
		Role:           caller.Role,
		OrganizationID: &orgID,
	}

	t.Run("OrgAdmin can invite another OrgAdmin", func(t *testing.T) {
		payload := map[string]any{
			"email": "invitedadmin@testorg.com",
			"role":  model.RoleOrgAdmin,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := middleware.WithUser(req.Context(), claims)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		admHandler.CreateInvitation(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse response: %v", err)
		}

		invMap, ok := resp["invitation"].(map[string]any)
		if !ok {
			t.Fatalf("expected invitation in response")
		}
		if invMap["email"] != "invitedadmin@testorg.com" {
			t.Errorf("expected email invitedadmin@testorg.com, got %v", invMap["email"])
		}
		if invMap["role"] != model.RoleOrgAdmin {
			t.Errorf("expected role org_admin, got %v", invMap["role"])
		}
	})

	t.Run("OrgAdmin can invite Mentor", func(t *testing.T) {
		payload := map[string]any{
			"email": "mentor@testorg.com",
			"role":  model.RoleMentor,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := middleware.WithUser(req.Context(), claims)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		admHandler.CreateInvitation(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("OrgAdmin CANNOT invite Superadmin", func(t *testing.T) {
		payload := map[string]any{
			"email": "hackedsuper@test.com",
			"role":  model.RoleSuperadmin,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := middleware.WithUser(req.Context(), claims)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		admHandler.CreateInvitation(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden, got %d", w.Code)
		}
	})

	t.Run("GetTeam lists members and invitations", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/team", nil)
		ctx := middleware.WithUser(req.Context(), claims)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		admHandler.GetTeam(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		members := resp["members"].([]any)
		invitations := resp["invitations"].([]any)

		if len(members) == 0 {
			t.Errorf("expected at least 1 member")
		}
		if len(invitations) < 2 {
			t.Errorf("expected at least 2 invitations, got %d", len(invitations))
		}
	})

	t.Run("Revoke and Resend Invitation", func(t *testing.T) {
		invs, _ := invRepo.ListByOrganization(context.Background(), orgID)
		if len(invs) == 0 {
			t.Fatalf("expected invitations")
		}
		targetInv := invs[0]

		// Resend
		resendReq := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations/"+targetInv.ID.String()+"/resend", nil)
		resendCtx := middleware.WithUser(resendReq.Context(), claims)
		rctxResend := chi.NewRouteContext()
		rctxResend.URLParams.Add("id", targetInv.ID.String())
		resendCtx = context.WithValue(resendCtx, chi.RouteCtxKey, rctxResend)
		resendReq = resendReq.WithContext(resendCtx)
		wResend := httptest.NewRecorder()

		admHandler.ResendInvitation(wResend, resendReq)
		if wResend.Code != http.StatusOK {
			t.Errorf("expected 200 on resend, got %d: %s", wResend.Code, wResend.Body.String())
		}

		// Revoke
		revokeReq := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/invitations/"+targetInv.ID.String(), nil)
		revokeCtx := middleware.WithUser(revokeReq.Context(), claims)
		rctxRevoke := chi.NewRouteContext()
		rctxRevoke.URLParams.Add("id", targetInv.ID.String())
		revokeCtx = context.WithValue(revokeCtx, chi.RouteCtxKey, rctxRevoke)
		revokeReq = revokeReq.WithContext(revokeCtx)
		wRevoke := httptest.NewRecorder()

		admHandler.RevokeInvitation(wRevoke, revokeReq)
		if wRevoke.Code != http.StatusOK {
			t.Errorf("expected 200 on revoke, got %d: %s", wRevoke.Code, wRevoke.Body.String())
		}
	})
}

func TestAdminHandler_SuperadminInvite(t *testing.T) {
	admHandler, _, _, _, _, _, orgID := setupTestInvitationEnv(t)

	superClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "super@fellowhire.com",
		Role:   model.RoleSuperadmin,
	}

	t.Run("Superadmin can invite another Superadmin", func(t *testing.T) {
		payload := map[string]any{
			"email": "newsuper@fellowhire.com",
			"role":  model.RoleSuperadmin,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := middleware.WithUser(req.Context(), superClaims)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		admHandler.CreateInvitation(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Superadmin can invite Admin to a specific Company", func(t *testing.T) {
		orgIDStr := orgID.String()
		payload := map[string]any{
			"email":           "companyadminbysuper@test.com",
			"role":            model.RoleOrgAdmin,
			"organization_id": orgIDStr,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := middleware.WithUser(req.Context(), superClaims)
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		admHandler.CreateInvitation(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		inv := resp["invitation"].(map[string]any)
		if inv["organization_id"] != orgIDStr {
			t.Errorf("expected org_id %s, got %v", orgIDStr, inv["organization_id"])
		}
	})
}

func TestAuthHandler_AcceptInvitation(t *testing.T) {
	admHandler, authHandler, userRepo, _, invRepo, _, orgID := setupTestInvitationEnv(t)

	// Send an invitation
	superClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "super@fellowhire.com",
		Role:   model.RoleSuperadmin,
	}
	orgIDStr := orgID.String()
	payload := map[string]any{
		"email":           "joiner@acme.com",
		"role":            model.RoleOrgAdmin,
		"organization_id": orgIDStr,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := middleware.WithUser(req.Context(), superClaims)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	admHandler.CreateInvitation(w, req)

	invs, _ := invRepo.ListByOrganization(context.Background(), orgID)
	var inviteToken string
	for _, inv := range invs {
		if inv.Email == "joiner@acme.com" {
			inviteToken = inv.Token
			break
		}
	}
	if inviteToken == "" {
		t.Fatalf("failed to find invite token")
	}

	t.Run("GetInvitation details", func(t *testing.T) {
		getReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/invitations/"+inviteToken, nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("token", inviteToken)
		getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, rctx))
		wGet := httptest.NewRecorder()

		authHandler.GetInvitation(wGet, getReq)

		if wGet.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", wGet.Code, wGet.Body.String())
		}

		var resp map[string]any
		_ = json.Unmarshal(wGet.Body.Bytes(), &resp)
		if resp["email"] != "joiner@acme.com" {
			t.Errorf("expected email joiner@acme.com, got %v", resp["email"])
		}
		if resp["role"] != model.RoleOrgAdmin {
			t.Errorf("expected role org_admin, got %v", resp["role"])
		}
		if resp["is_existing_user"] != false {
			t.Errorf("expected is_existing_user false")
		}
	})

	t.Run("AcceptInvitation creates new user and returns cookies", func(t *testing.T) {
		acceptPayload := map[string]any{
			"name":     "Joiner Admin",
			"password": "strongPassword123!",
		}
		accBody, _ := json.Marshal(acceptPayload)
		accReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/invitations/"+inviteToken+"/accept", bytes.NewReader(accBody))
		accReq.Header.Set("Content-Type", "application/json")
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("token", inviteToken)
		accReq = accReq.WithContext(context.WithValue(accReq.Context(), chi.RouteCtxKey, rctx))
		wAcc := httptest.NewRecorder()

		authHandler.AcceptInvitation(wAcc, accReq)

		if wAcc.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", wAcc.Code, wAcc.Body.String())
		}

		// Verify user created in DB
		user, err := userRepo.GetByEmail(context.Background(), "joiner@acme.com")
		if err != nil || user == nil {
			t.Fatalf("expected user to exist in repository: %v", err)
		}
		if user.Role != model.RoleOrgAdmin {
			t.Errorf("expected role org_admin, got %s", user.Role)
		}
		if user.OrganizationID == nil || *user.OrganizationID != orgID {
			t.Errorf("expected org ID %s, got %v", orgID, user.OrganizationID)
		}
		if !user.EmailVerified {
			t.Errorf("expected email_verified to be true")
		}

		// Verify invitation is now accepted
		inv, _ := invRepo.GetByToken(context.Background(), inviteToken)
		if inv.Status != model.InvitationStatusAccepted {
			t.Errorf("expected status accepted, got %s", inv.Status)
		}

		// Re-accepting should fail
		wAcc2 := httptest.NewRecorder()
		authHandler.AcceptInvitation(wAcc2, accReq)
		if wAcc2.Code != http.StatusBadRequest {
			t.Errorf("expected 400 on re-accepting, got %d", wAcc2.Code)
		}
	})
}

