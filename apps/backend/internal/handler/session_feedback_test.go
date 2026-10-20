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
	admin, _ := userRepo.Create(ctx, "admin@fb.test", "hash", "Olivia Organizer", model.RoleOrgAdmin, &org.ID)
	mentor, _ := userRepo.Create(ctx, "mentor@fb.test", "hash", "Maya Mentor", model.RoleMentor, &org.ID)
	fellowUser, _ := userRepo.Create(ctx, "fellow@fb.test", "", "Fiona Fellow", model.RoleCandidate, nil)
	outsiderUser, _ := userRepo.Create(ctx, "outsider@fb.test", "", "Out Sider", model.RoleCandidate, nil)

	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "feedback", Name: "Feedback Program"})
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, mentor.ID, "Mentor", "")
	fellow, _, _ := applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID, ProgramID: program.ID, Email: "fellow@fb.test", FullName: "Fiona Fellow", CurrentStage: model.StageApprovedForLive,
	})
	start := time.Now().Add(-time.Hour)
	session, _ := sessionRepo.CreateSession(ctx, &model.ProgramSession{
		ProgramID: program.ID, Title: "Session", StartTime: start, EndTime: start.Add(time.Hour), MentorID: &mentor.ID,
	})

	h := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)
	r := chi.NewRouter()
	r.Get("/sessions/{sessionId}/feedback", h.GetSessionFeedback)
	r.Put("/sessions/{sessionId}/feedback/mentor", h.SaveFeedbackToMentor)
	r.Put("/sessions/{sessionId}/feedback/organizer", h.SaveFeedbackToOrganizer)
	r.Put("/sessions/{sessionId}/feedback/fellows/{applicantId}", h.SaveFeedbackToFellow)
	r.Post("/sessions/{sessionId}/end", h.EndSession)
	r.Delete("/sessions/{sessionId}/end", h.ReopenSession)

	do := func(u *model.User, method, path string, body any) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req = req.WithContext(middleware.WithUser(req.Context(), &auth.Claims{UserID: u.ID, Email: u.Email, Role: u.Role, OrganizationID: u.OrganizationID}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	base := "/sessions/" + session.ID.String() + "/feedback"
	toMentor := map[string]any{"scores": map[string]int{"clarity": 5, "preparation": 4, "engagement": 4, "helpfulness": 5}, "comment": "Clear examples"}
	toOrgFromFellow := map[string]any{"scores": map[string]int{"organization": 3, "communication": 4, "materials": 5}, "comment": "Link came late"}
	toFellow := map[string]any{"scores": map[string]int{"activeness": 5, "understanding": 4, "preparation": 3, "collaboration": 4}, "comment": "Private note for staff"}
	toOrgFromMentor := map[string]any{"scores": map[string]int{"logistics": 4, "support": 5, "fellow_readiness": 3}}

	if w := do(outsiderUser, http.MethodGet, base, nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for outsider, got %d", w.Code)
	}
	// Closed until the mentor ends the session
	if w := do(fellowUser, http.MethodPut, base+"/mentor", toMentor); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 before the session is ended, got %d", w.Code)
	}
	if w := do(mentor, http.MethodPost, "/sessions/"+session.ID.String()+"/end", nil); w.Code != http.StatusOK {
		t.Fatalf("expected the mentor to end the session, got %d", w.Code)
	}

	// Every question needs a 1-5 score
	if w := do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"scores": map[string]int{"clarity": 5}}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing questions, got %d", w.Code)
	}
	if w := do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"scores": map[string]int{"clarity": 6, "preparation": 4, "engagement": 4, "helpfulness": 5}}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an out-of-range score, got %d", w.Code)
	}
	for _, c := range []struct {
		u    *model.User
		path string
		body any
		want int
	}{
		{fellowUser, base + "/mentor", toMentor, http.StatusOK},
		{fellowUser, base + "/organizer", toOrgFromFellow, http.StatusOK},
		{mentor, base + "/fellows/" + fellow.ID.String(), toFellow, http.StatusOK},
		{mentor, base + "/organizer", toOrgFromMentor, http.StatusOK},
		{admin, base + "/organizer", toOrgFromMentor, http.StatusForbidden},
		{fellowUser, base + "/fellows/" + fellow.ID.String(), toFellow, http.StatusForbidden},
		{mentor, base + "/mentor", toMentor, http.StatusForbidden},
	} {
		if w := do(c.u, http.MethodPut, c.path, c.body); w.Code != c.want {
			t.Fatalf("%s %s: expected %d, got %d: %s", c.u.Email, c.path, c.want, w.Code, w.Body.String())
		}
	}

	get := func(u *model.User) map[string]any {
		w := do(u, http.MethodGet, base, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return out
	}

	// Fellow: their own feedback, and only the scores the mentor gave them
	fv := get(fellowUser)
	mine := fv["mine"].(map[string]any)
	if fv["viewer"] != "fellow" || mine["to_mentor"] == nil || mine["fellow_to_organizer"] == nil {
		t.Fatalf("expected the fellow's own feedback, got %v", fv["mine"])
	}
	results := fv["my_results"].(map[string]any)
	if results["scores"].(map[string]any)["activeness"] != float64(5) || results["comment"] != nil || results["author_name"] != nil {
		t.Fatalf("fellow should see only scores, got %v", results)
	}
	if fv["about_mentor"] != nil || fv["fellows"] != nil || fv["to_organizers_from_fellows"] != nil {
		t.Fatalf("fellow should not see other feedback: %v", fv)
	}

	// Mentor: feedback about them with names, their feedback to fellows, not the organizers' feedback
	mv := get(mentor)
	about := mv["about_mentor"].(map[string]any)
	item := about["items"].([]any)[0].(map[string]any)
	if mv["viewer"] != "mentor" || item["author_name"] != "Fiona Fellow" || item["comment"] != "Clear examples" || about["averages"].(map[string]any)["clarity"] != float64(5) {
		t.Fatalf("mentor should see named feedback with averages, got %v", about)
	}
	row := mv["fellows"].([]any)[0].(map[string]any)
	if row["feedback"].(map[string]any)["comment"] != "Private note for staff" {
		t.Fatalf("mentor should see their full feedback to the fellow, got %v", row)
	}
	if mv["mine"].(map[string]any)["mentor_to_organizer"] == nil || mv["to_organizers_from_fellows"] != nil {
		t.Fatalf("unexpected mentor view of organizer feedback: %v", mv)
	}

	// Organizers: everything, including feedback to the organizers
	av := get(admin)
	fromFellows := av["to_organizers_from_fellows"].(map[string]any)
	fromMentors := av["to_organizers_from_mentors"].(map[string]any)
	if av["viewer"] != "admin" || fromFellows["count"] != float64(1) || fromMentors["count"] != float64(1) {
		t.Fatalf("organizers should see feedback to them, got %v / %v", fromFellows, fromMentors)
	}
	if fromMentors["items"].([]any)[0].(map[string]any)["author_name"] != "Maya Mentor" {
		t.Fatalf("expected the mentor's name on their feedback, got %v", fromMentors)
	}

	// Saving again updates rather than adds; reopening closes feedback
	_ = do(fellowUser, http.MethodPut, base+"/mentor", map[string]any{"scores": map[string]int{"clarity": 2, "preparation": 2, "engagement": 2, "helpfulness": 2}})
	if a := get(admin)["about_mentor"].(map[string]any); a["count"] != float64(1) || a["averages"].(map[string]any)["clarity"] != float64(2) {
		t.Fatalf("expected one updated feedback, got %v", a)
	}
	_ = do(admin, http.MethodDelete, "/sessions/"+session.ID.String()+"/end", nil)
	if w := do(fellowUser, http.MethodPut, base+"/mentor", toMentor); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 after reopening, got %d", w.Code)
	}
}
