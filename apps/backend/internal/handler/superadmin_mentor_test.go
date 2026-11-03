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

// A superadmin invited as a program's mentor keeps superadmin and becomes the program's mentor.
func TestAcceptInvitation_SuperadminStaysSuperadminAsMentor(t *testing.T) {
	ctx := context.Background()
	_, authHandler, userRepo, _, invRepo, authSvc, orgID := setupTestInvitationEnv(t)
	mentorRepo := repository.NewMentorRepository(nil)
	authHandler.SetMentorRepo(mentorRepo)

	programID := uuid.New()
	sa, _ := userRepo.Create(ctx, "lead@example.com", "", "Lead", model.RoleSuperadmin, nil)
	inv, _ := invRepo.Create(ctx, &model.Invitation{
		Email: sa.Email, Role: model.RoleMentor, OrganizationID: &orgID, ProgramID: &programID,
		Token: "invite-token-superadmin-mentor", Status: model.InvitationStatusPending, ExpiresAt: time.Now().Add(time.Hour),
	})
	token, _ := authSvc.GenerateToken(sa.ID, nil, sa.Email, sa.Role)
	w := postJSON(t, authHandler.AcceptInvitation, "/api/v1/auth/invitations/"+inv.Token+"/accept", map[string]string{}, func(r *http.Request) {
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("token", inv.Token)
		*r = *r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
		r.AddCookie(&http.Cookie{Name: auth.AuthCookieName, Value: token})
	})
	if w.Code != http.StatusOK {
		t.Fatalf("accept failed: %d %s", w.Code, w.Body.String())
	}
	var resp struct {
		RedirectURL string `json:"redirect_url"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.RedirectURL != "/mentor/dashboard" {
		t.Errorf("redirect = %q, want /mentor/dashboard", resp.RedirectURL)
	}
	if u, _ := userRepo.GetByID(ctx, sa.ID); u.Role != model.RoleSuperadmin || u.OrganizationID != nil {
		t.Fatalf("expected to stay superadmin without a company, got %q %v", u.Role, u.OrganizationID)
	}
	if ok, _ := mentorRepo.IsMentorOfProgram(ctx, sa.ID, programID); !ok {
		t.Fatal("expected to be assigned as the program's mentor")
	}
}

// The session's own mentor gets the mentor view of feedback even when they are a superadmin.
func TestSessionFeedback_SuperadminSessionMentorGetsMentorView(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	org, _ := orgRepo.Register(ctx, "sa-mentor-org", "SA Mentor Org", "admin@sam.test", "", model.OrgStatusApproved)
	sa, _ := userRepo.Create(ctx, "lead@sam.test", "", "Lead", model.RoleSuperadmin, nil)
	other, _ := userRepo.Create(ctx, "other@sam.test", "", "Other", model.RoleSuperadmin, nil)
	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "sam", Name: "SA Mentor Program"})
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, sa.ID, "Mentor", "")
	start := time.Now().Add(-time.Hour)
	session, _ := sessionRepo.CreateSession(ctx, &model.ProgramSession{
		ProgramID: program.ID, Title: "Session", StartTime: start, EndTime: start.Add(time.Hour), MentorID: &sa.ID,
	})

	h := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)
	r := chi.NewRouter()
	r.Get("/sessions/{sessionId}/feedback", h.GetSessionFeedback)
	r.Put("/sessions/{sessionId}/feedback/organizer", h.SaveFeedbackToOrganizer)
	do := func(u *model.User, method string, path string, body any) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req = req.WithContext(middleware.WithUser(req.Context(), &auth.Claims{UserID: u.ID, Email: u.Email, Role: u.Role}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	viewerOf := func(u *model.User) string {
		w := do(u, http.MethodGet, "/sessions/"+session.ID.String()+"/feedback", nil)
		var resp struct {
			Viewer string `json:"viewer"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return resp.Viewer
	}

	if v := viewerOf(sa); v != "mentor" {
		t.Errorf("session mentor viewer = %q, want mentor", v)
	}
	if v := viewerOf(other); v != "admin" {
		t.Errorf("other superadmin viewer = %q, want admin", v)
	}
}
