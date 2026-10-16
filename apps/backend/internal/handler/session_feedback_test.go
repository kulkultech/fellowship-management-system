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

func TestSessionFeedback(t *testing.T) {
	ctx := context.Background()

	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	org, _ := orgRepo.Register(ctx, "feedback-org", "Feedback Org", "admin@fb.test", "", model.OrgStatusApproved)
	admin, _ := userRepo.Create(ctx, "admin@fb.test", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	mentor, _ := userRepo.Create(ctx, "mentor@fb.test", "hash", "Maya Mentor", model.RoleMentor, &org.ID)
	fellowUser, _ := userRepo.Create(ctx, "fellow@fb.test", "", "Fiona Fellow", model.RoleCandidate, nil)
	outsiderUser, _ := userRepo.Create(ctx, "outsider@fb.test", "", "Out Sider", model.RoleCandidate, nil)

	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "feedback", Name: "Feedback Program"})
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, mentor.ID, "Mentor", "")
	fellow, _, _ := applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID, ProgramID: program.ID, Email: "fellow@fb.test", FullName: "Fiona Fellow", CurrentStage: model.StageApprovedForLive,
	})

	newSession := func(start time.Time) *model.ProgramSession {
		s, err := sessionRepo.CreateSession(ctx, &model.ProgramSession{
			ProgramID: program.ID, Title: "Session", StartTime: start, EndTime: start.Add(time.Hour), MentorID: &mentor.ID,
		})
		if err != nil {
			t.Fatalf("failed to create session: %v", err)
		}
		return s
	}
	past := newSession(time.Now().Add(-time.Hour))
	future := newSession(time.Now().Add(24 * time.Hour))

	h := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)
	r := chi.NewRouter()
	r.Get("/sessions/{sessionId}/feedback", h.GetSessionFeedback)
	r.Put("/sessions/{sessionId}/feedback/mentor", h.SaveFeedbackToMentor)
	r.Put("/sessions/{sessionId}/feedback/fellows/{applicantId}", h.SaveFeedbackToFellow)
	r.Post("/sessions/{sessionId}/end", h.EndSession)
	r.Delete("/sessions/{sessionId}/end", h.ReopenSession)

	claimsFor := func(u *model.User) *auth.Claims {
		return &auth.Claims{UserID: u.ID, Email: u.Email, Role: u.Role, OrganizationID: u.OrganizationID}
	}
	do := func(u *model.User, method, path string, body any) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req = req.WithContext(middleware.WithUser(req.Context(), claimsFor(u)))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	base := "/sessions/" + past.ID.String() + "/feedback"

	// People outside the session cannot see or give feedback
	if w := do(outsiderUser, http.MethodGet, base, nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for outsider, got %d", w.Code)
	}

	// Feedback stays closed until a mentor ends the session, and only staff can end it
	if w := do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"rating": 4}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 before the session is ended, got %d", w.Code)
	}
	if w := do(fellowUser, http.MethodPost, "/sessions/"+past.ID.String()+"/end", nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when a fellow ends the session, got %d", w.Code)
	}
	if w := do(mentor, http.MethodPost, "/sessions/"+past.ID.String()+"/end", nil); w.Code != http.StatusOK {
		t.Fatalf("expected 200 when the mentor ends the session, got %d: %s", w.Code, w.Body.String())
	}
	if ended, _ := sessionRepo.GetSessionByID(ctx, past.ID); ended.EndedAt == nil || ended.EndedByName != "Maya Mentor" {
		t.Fatalf("expected the session to be ended by Maya Mentor, got %+v", ended)
	}

	// Fellow rates the mentor; a rating is required
	if w := do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"comment": "Great"}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without rating, got %d", w.Code)
	}
	if w := do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"rating": 4, "comment": "Clear examples"}); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	// Fellows cannot write feedback to fellows, and feedback is closed before the session starts
	if w := do(fellowUser, http.MethodPut, base+"/fellows/"+fellow.ID.String(), map[string]any{"comment": "x"}); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for fellow writing to fellow, got %d", w.Code)
	}
	if w := do(fellowUser, http.MethodPut, "/sessions/"+future.ID.String()+"/feedback/mentor", map[string]any{"rating": 5}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a session that was not ended, got %d", w.Code)
	}

	// Mentor gives feedback to the fellow; a comment is required
	if w := do(mentor, http.MethodPut, base+"/fellows/"+fellow.ID.String(), map[string]any{"rating": 5}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without comment, got %d", w.Code)
	}
	if w := do(mentor, http.MethodPut, base+"/fellows/"+fellow.ID.String(), map[string]any{"rating": 5, "comment": "Strong questions"}); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	type resp struct {
		Viewer     string `json:"viewer"`
		MyFeedback *struct {
			Rating  *int
			Comment string
		} `json:"my_feedback"`
		MentorFeedback *struct {
			Rating     *int   `json:"rating"`
			Comment    string `json:"comment"`
			AuthorName string `json:"author_name"`
		} `json:"mentor_feedback"`
		ToMentor *struct {
			Average   float64 `json:"average"`
			Count     int     `json:"count"`
			Anonymous bool    `json:"anonymous"`
			Items     []struct {
				FellowName string `json:"fellow_name"`
				Comment    string `json:"comment"`
			} `json:"items"`
		} `json:"to_mentor"`
		Fellows []struct {
			FellowName string `json:"fellow_name"`
			Feedback   *struct {
				Comment string `json:"comment"`
			} `json:"feedback"`
		} `json:"fellows"`
	}
	get := func(u *model.User) resp {
		w := do(u, http.MethodGet, base, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var out resp
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return out
	}

	// The fellow sees their own feedback and the mentor's feedback to them
	fv := get(fellowUser)
	if fv.Viewer != "fellow" || fv.MyFeedback == nil || fv.MentorFeedback == nil || fv.MentorFeedback.Comment != "Strong questions" || fv.MentorFeedback.AuthorName != "Maya Mentor" {
		t.Fatalf("unexpected fellow view: %+v", fv)
	}

	// The mentor sees the rating anonymously; admins see who wrote it
	mv := get(mentor)
	if mv.Viewer != "staff" || mv.ToMentor == nil || mv.ToMentor.Average != 4 || mv.ToMentor.Count != 1 || !mv.ToMentor.Anonymous || mv.ToMentor.Items[0].FellowName != "" {
		t.Fatalf("unexpected mentor view: %+v", mv.ToMentor)
	}
	if len(mv.Fellows) != 1 || mv.Fellows[0].Feedback == nil || mv.Fellows[0].Feedback.Comment != "Strong questions" {
		t.Fatalf("expected the fellow row with feedback, got %+v", mv.Fellows)
	}
	av := get(admin)
	if av.ToMentor.Anonymous || av.ToMentor.Items[0].FellowName != "Fiona Fellow" {
		t.Fatalf("expected admins to see names, got %+v", av.ToMentor)
	}

	// Saving again updates the same feedback instead of adding another
	_ = do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"rating": 2, "comment": "Too fast"})
	if av := get(admin); av.ToMentor.Count != 1 || av.ToMentor.Average != 2 {
		t.Fatalf("expected one updated rating, got %+v", av.ToMentor)
	}

	// Reopening closes feedback again (what was given is kept)
	if w := do(admin, http.MethodDelete, "/sessions/"+past.ID.String()+"/end", nil); w.Code != http.StatusOK {
		t.Fatalf("expected 200 on reopen, got %d", w.Code)
	}
	if w := do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"rating": 5}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 after reopening, got %d", w.Code)
	}
	if av := get(admin); av.ToMentor.Count != 1 {
		t.Fatalf("expected the earlier feedback to be kept, got %+v", av.ToMentor)
	}
}
