package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestProgramRoomContent(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)

	org, _ := orgRepo.Register(ctx, "room-org", "Room Org", "admin@room.test", "", model.OrgStatusApproved)
	otherOrg, _ := orgRepo.Register(ctx, "room-other", "Other", "admin@other.test", "", model.OrgStatusApproved)
	admin, _ := userRepo.Create(ctx, "admin@room.test", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	otherAdmin, _ := userRepo.Create(ctx, "admin@other.test", "hash", "Other Admin", model.RoleOrgAdmin, &otherOrg.ID)
	mentor, _ := userRepo.Create(ctx, "mentor@room.test", "hash", "Mentor", model.RoleMentor, &org.ID)
	stranger, _ := userRepo.Create(ctx, "stranger@room.test", "hash", "Stranger", model.RoleMentor, &org.ID)

	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "room", Name: "Room Program"})
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, mentor.ID, "Mentor", "")
	_, _, _ = applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID, ProgramID: program.ID, Email: "fellow@room.test", FullName: "Fellow", CurrentStage: model.StageApprovedForLive,
	})
	_, _, _ = applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID, ProgramID: program.ID, Email: "applicant@room.test", FullName: "Applicant", CurrentStage: model.StageTestInProgress,
	})

	h := handler.NewRoomContentHandler(repository.NewRoomContentRepository(nil), programRepo, applicantRepo, mentorRepo)
	r := chi.NewRouter()
	r.Get("/programs/{programId}/room-content", h.GetContent)
	r.Put("/programs/{programId}/room-content/curriculum", h.SaveCurriculum)
	r.Put("/programs/{programId}/room-content/resources", h.SaveResources)
	base := "/programs/" + program.ID.String() + "/room-content"

	staff := func(u *model.User) *auth.Claims {
		return &auth.Claims{UserID: u.ID, Email: u.Email, Role: u.Role, OrganizationID: u.OrganizationID}
	}
	candidate := func(email string) *auth.Claims { return &auth.Claims{Email: email, Role: model.RoleCandidate} }
	do := func(c *auth.Claims, method, path string, body any) (*httptest.ResponseRecorder, map[string]json.RawMessage) {
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithUser(req.Context(), c))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var resp map[string]json.RawMessage
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return w, resp
	}

	// Empty by default; fellows can read but not edit
	w, resp := do(candidate("fellow@room.test"), http.MethodGet, base, nil)
	if w.Code != http.StatusOK || string(resp["can_edit"]) != "false" {
		t.Fatalf("expected fellow read access without edit, got %d %s", w.Code, w.Body.String())
	}

	// Mentor saves curriculum; ids are assigned and text trimmed
	w, resp = do(staff(mentor), http.MethodPut, base+"/curriculum", map[string]any{"items": []map[string]string{
		{"title": "  Week 1: Foundations ", "description": "Rust basics", "start_date": "2026-10-01", "end_date": "2026-10-07"},
		{"title": "Week 2: Async"},
	}})
	if w.Code != http.StatusOK {
		t.Fatalf("expected mentor to save curriculum, got %d: %s", w.Code, w.Body.String())
	}
	var content model.ProgramRoomContent
	_ = json.Unmarshal(resp["content"], &content)
	if len(content.Curriculum) != 2 || content.Curriculum[0].Title != "Week 1: Foundations" || content.Curriculum[0].ID == "" {
		t.Fatalf("unexpected curriculum: %+v", content.Curriculum)
	}

	// Admin saves resources
	if w, _ := do(staff(admin), http.MethodPut, base+"/resources", map[string]any{"items": []map[string]string{
		{"title": "Cohort Discord", "url": "https://discord.gg/example", "category": "channel"},
		{"title": "Starter repo", "url": "https://github.com/example/starter"},
	}}); w.Code != http.StatusOK {
		t.Fatalf("expected admin to save resources, got %d: %s", w.Code, w.Body.String())
	}

	// Fellow sees both lists
	_, resp = do(candidate("fellow@room.test"), http.MethodGet, base, nil)
	_ = json.Unmarshal(resp["content"], &content)
	if len(content.Curriculum) != 2 || len(content.Resources) != 2 || content.Resources[1].Category != "link" {
		t.Fatalf("unexpected content for fellow: %+v", content)
	}

	// Validation
	for name, tc := range map[string]struct {
		path string
		body any
	}{
		"missing title":    {"/curriculum", map[string]any{"items": []map[string]string{{"title": " "}}}},
		"bad date":         {"/curriculum", map[string]any{"items": []map[string]string{{"title": "x", "start_date": "10/01/2026"}}}},
		"end before start": {"/curriculum", map[string]any{"items": []map[string]string{{"title": "x", "start_date": "2026-10-07", "end_date": "2026-10-01"}}}},
		"javascript url":   {"/resources", map[string]any{"items": []map[string]string{{"title": "x", "url": "javascript:alert(1)"}}}},
		"bad category":     {"/resources", map[string]any{"items": []map[string]string{{"title": "x", "url": "https://a.test", "category": "secret"}}}},
	} {
		if w, _ := do(staff(admin), http.MethodPut, base+tc.path, tc.body); w.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d", name, w.Code)
		}
	}

	// Access control
	if w, _ := do(candidate("fellow@room.test"), http.MethodPut, base+"/resources", map[string]any{"items": []any{}}); w.Code != http.StatusForbidden {
		t.Fatalf("expected fellow edit to be forbidden, got %d", w.Code)
	}
	if w, _ := do(candidate("applicant@room.test"), http.MethodGet, base, nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected non-accepted applicant to be forbidden, got %d", w.Code)
	}
	if w, _ := do(staff(stranger), http.MethodGet, base, nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected unassigned mentor to be forbidden, got %d", w.Code)
	}
	if w, _ := do(staff(otherAdmin), http.MethodPut, base+"/curriculum", map[string]any{"items": []any{}}); w.Code != http.StatusForbidden {
		t.Fatalf("expected other org admin edit to be forbidden, got %d", w.Code)
	}
}
