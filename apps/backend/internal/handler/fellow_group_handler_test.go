package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestFellowGroups(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	groupRepo := repository.NewFellowGroupRepository(nil)

	org, _ := orgRepo.Register(ctx, "groups-org", "Groups Org", "admin@groups.test", "", model.OrgStatusApproved)
	otherOrg, _ := orgRepo.Register(ctx, "groups-other", "Other Org", "admin@other.test", "", model.OrgStatusApproved)
	admin, _ := userRepo.Create(ctx, "admin@groups.test", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	otherAdmin, _ := userRepo.Create(ctx, "admin@other.test", "hash", "Other", model.RoleOrgAdmin, &otherOrg.ID)
	mentor, _ := userRepo.Create(ctx, "mentor@groups.test", "hash", "Mentor", model.RoleMentor, &org.ID)
	strangerMentor, _ := userRepo.Create(ctx, "stranger@groups.test", "hash", "Stranger", model.RoleMentor, &org.ID)

	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "groups", Name: "Groups Program"})
	otherProgram, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "groups-2", Name: "Other Program"})
	_, _ = mentorRepo.AssignMentor(ctx, program.ID, mentor.ID, "Mentor", "")

	newFellow := func(programID uuid.UUID, email string) *model.Applicant {
		a, _, err := applicantRepo.CreateOrGet(ctx, &model.Applicant{
			OrganizationID: org.ID, ProgramID: programID, Email: email, FullName: email, CurrentStage: model.StageApprovedForLive,
		})
		if err != nil {
			t.Fatalf("failed to create fellow: %v", err)
		}
		return a
	}
	f1 := newFellow(program.ID, "f1@groups.test")
	f2 := newFellow(program.ID, "f2@groups.test")
	f3 := newFellow(program.ID, "f3@groups.test")
	foreign := newFellow(otherProgram.ID, "foreign@groups.test")

	h := handler.NewFellowGroupHandler(groupRepo, programRepo, applicantRepo, mentorRepo)
	r := chi.NewRouter()
	r.Route("/programs/{programId}/fellow-groups", func(fg chi.Router) {
		fg.Get("/", h.ListGroups)
		fg.Post("/", h.CreateGroup)
		fg.Put("/{groupId}", h.UpdateGroup)
		fg.Delete("/{groupId}", h.DeleteGroup)
	})
	base := "/programs/" + program.ID.String() + "/fellow-groups/"

	do := func(u *model.User, method, path string, body any) (*httptest.ResponseRecorder, map[string]json.RawMessage) {
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithUser(req.Context(), &auth.Claims{
			UserID: u.ID, Email: u.Email, Role: u.Role, OrganizationID: u.OrganizationID,
		}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var resp map[string]json.RawMessage
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return w, resp
	}
	ids := func(apps ...*model.Applicant) []string {
		var out []string
		for _, a := range apps {
			out = append(out, a.ID.String())
		}
		return out
	}

	// Admin creates a group (duplicates in the request are collapsed, name whitespace normalized)
	w, resp := do(admin, http.MethodPost, base, map[string]any{"name": "  Backend   Squad ", "member_ids": append(ids(f1, f2), f1.ID.String())})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var group model.FellowGroup
	_ = json.Unmarshal(resp["group"], &group)
	if group.Name != "Backend Squad" || len(group.MemberIDs) != 2 {
		t.Fatalf("unexpected group: %+v", group)
	}

	// Assigned mentor can create and list; names are unique per program (case-insensitive)
	if w, _ := do(mentor, http.MethodPost, base, map[string]any{"name": "Frontend", "member_ids": ids(f3)}); w.Code != http.StatusCreated {
		t.Fatalf("expected mentor to create group, got %d: %s", w.Code, w.Body.String())
	}
	if w, _ := do(admin, http.MethodPost, base, map[string]any{"name": "backend squad", "member_ids": ids(f3)}); w.Code != http.StatusConflict {
		t.Fatalf("expected 409 for duplicate name, got %d", w.Code)
	}
	w, resp = do(mentor, http.MethodGet, base, nil)
	var groups []model.FellowGroup
	_ = json.Unmarshal(resp["groups"], &groups)
	if w.Code != http.StatusOK || len(groups) != 2 || groups[0].Name != "Backend Squad" {
		t.Fatalf("unexpected list: %d %+v", w.Code, groups)
	}

	// Validation
	for _, body := range []map[string]any{
		{"name": "", "member_ids": ids(f1)},
		{"name": "Empty", "member_ids": []string{}},
		{"name": "Foreign", "member_ids": ids(f1, foreign)},
		{"name": "Bad", "member_ids": []string{"not-a-uuid"}},
	} {
		if w, _ := do(admin, http.MethodPost, base, body); w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for %v, got %d", body, w.Code)
		}
	}

	// Update renames and replaces members
	w, resp = do(admin, http.MethodPut, base+group.ID.String(), map[string]any{"name": "Backend Team", "member_ids": ids(f2, f3)})
	_ = json.Unmarshal(resp["group"], &group)
	if w.Code != http.StatusOK || group.Name != "Backend Team" || len(group.MemberIDs) != 2 {
		t.Fatalf("unexpected update: %d %+v", w.Code, group)
	}

	// Access control
	if w, _ := do(otherAdmin, http.MethodGet, base, nil); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for other org admin, got %d", w.Code)
	}
	if w, _ := do(strangerMentor, http.MethodPost, base, map[string]any{"name": "X", "member_ids": ids(f1)}); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for unassigned mentor, got %d", w.Code)
	}

	// Delete
	if w, _ := do(admin, http.MethodDelete, base+group.ID.String(), nil); w.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting group, got %d", w.Code)
	}
	if w, _ := do(admin, http.MethodDelete, base+group.ID.String(), nil); w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 deleting missing group, got %d", w.Code)
	}
}
