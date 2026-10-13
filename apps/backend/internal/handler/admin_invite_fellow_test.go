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

func TestInviteProgramFellow(t *testing.T) {
	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)

	adminHandler := handler.NewAdminHandler(
		appRepo,
		repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil),
		repository.NewQuestionSetRepository(nil),
		trackRepo,
		repository.NewAIInterviewRepository(nil),
		progRepo,
		orgRepo,
		repository.NewUserRepository(nil),
		nil,
		"https://example.test",
	)

	ctx := context.Background()
	org, err := orgRepo.Register(ctx, "kulkul", "KulKul Tech", "admin@kulkul.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}
	otherOrg, err := orgRepo.Register(ctx, "other", "Other Org", "admin@other.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register other org: %v", err)
	}

	newProgram := func(orgID uuid.UUID, slug string) *model.Program {
		p, err := progRepo.Create(ctx, &model.Program{
			ID:             uuid.New(),
			OrganizationID: orgID,
			Name:           "Program " + slug,
			Slug:           slug,
			OpenDate:       time.Now(),
			EndDate:        time.Now().Add(30 * 24 * time.Hour),
			Status:         "published",
		})
		if err != nil {
			t.Fatalf("failed to create program: %v", err)
		}
		return p
	}
	prog := newProgram(org.ID, "fellowship-2026")
	otherProg := newProgram(org.ID, "another-2026")

	track, err := trackRepo.Create(ctx, &model.Track{ID: uuid.New(), ProgramID: prog.ID, Slug: "backend", Name: "Backend"})
	if err != nil {
		t.Fatalf("failed to create track: %v", err)
	}
	foreignTrack, err := trackRepo.Create(ctx, &model.Track{ID: uuid.New(), ProgramID: otherProg.ID, Slug: "frontend", Name: "Frontend"})
	if err != nil {
		t.Fatalf("failed to create foreign track: %v", err)
	}

	adminClaims := &auth.Claims{UserID: uuid.New(), Email: "admin@kulkul.test", Role: model.RoleOrgAdmin, OrganizationID: &org.ID}
	otherAdminClaims := &auth.Claims{UserID: uuid.New(), Email: "admin@other.test", Role: model.RoleOrgAdmin, OrganizationID: &otherOrg.ID}

	invite := func(claims *auth.Claims, programID uuid.UUID, body map[string]string) (*httptest.ResponseRecorder, map[string]any) {
		r := chi.NewRouter()
		r.Post("/programs/{id}/fellows/invite", adminHandler.InviteProgramFellow)
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/programs/"+programID.String()+"/fellows/invite", bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return w, resp
	}

	t.Run("adds an outsider as an invited fellow", func(t *testing.T) {
		w, resp := invite(adminClaims, prog.ID, map[string]string{
			"full_name": "  Ada   Lovelace ",
			"email":     " Ada@Outside.test ",
			"track_id":  track.ID.String(),
		})
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if resp["already_member"] != false {
			t.Fatalf("expected already_member false, got %v", resp["already_member"])
		}
		app, err := appRepo.GetByProgramAndEmail(ctx, prog.ID, "ada@outside.test")
		if err != nil {
			t.Fatalf("expected fellow record: %v", err)
		}
		if app.CurrentStage != model.StageApprovedForLive || app.ProgramRoomInvitedAt == nil {
			t.Fatalf("expected approved and invited fellow, got stage %s invited %v", app.CurrentStage, app.ProgramRoomInvitedAt)
		}
		if app.FullName != "Ada Lovelace" || app.FirstName != "Ada" || app.LastName != "Lovelace" {
			t.Fatalf("unexpected name fields: %q %q %q", app.FullName, app.FirstName, app.LastName)
		}
		if app.TrackID == nil || *app.TrackID != track.ID {
			t.Fatalf("expected track to be set")
		}
		if app.OrganizationID != org.ID {
			t.Fatalf("expected fellow to belong to the program's organization")
		}
	})

	t.Run("re-inviting reports an existing member", func(t *testing.T) {
		w, resp := invite(adminClaims, prog.ID, map[string]string{"full_name": "Ada Lovelace", "email": "ada@outside.test"})
		if w.Code != http.StatusOK || resp["already_member"] != true {
			t.Fatalf("expected 200 with already_member true, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("approves an existing applicant without renaming them", func(t *testing.T) {
		existing, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
			OrganizationID: org.ID,
			ProgramID:      prog.ID,
			Email:          "pending@candidate.test",
			FullName:       "Original Name",
			CurrentStage:   model.StageTestInProgress,
		})
		if err != nil {
			t.Fatalf("failed to seed applicant: %v", err)
		}
		w, _ := invite(adminClaims, prog.ID, map[string]string{"full_name": "Typed By Admin", "email": "pending@candidate.test"})
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		app, _ := appRepo.GetByID(ctx, existing.ID)
		if app.CurrentStage != model.StageApprovedForLive || app.ProgramRoomInvitedAt == nil {
			t.Fatalf("expected existing applicant approved and invited, got %s", app.CurrentStage)
		}
		if app.FullName != "Original Name" {
			t.Fatalf("expected applicant name to be kept, got %q", app.FullName)
		}
	})

	t.Run("rejects invalid input", func(t *testing.T) {
		cases := []map[string]string{
			{"full_name": "", "email": "someone@outside.test"},
			{"full_name": "No Email", "email": "not-an-email"},
			{"full_name": "Display Name", "email": "Name <name@outside.test>"},
			{"full_name": "Wrong Track", "email": "wrong@outside.test", "track_id": foreignTrack.ID.String()},
		}
		for _, body := range cases {
			if w, _ := invite(adminClaims, prog.ID, body); w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for %v, got %d", body, w.Code)
			}
		}
	})

	t.Run("blocks admins of another organization", func(t *testing.T) {
		w, _ := invite(otherAdminClaims, prog.ID, map[string]string{"full_name": "Sneaky", "email": "sneaky@outside.test"})
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", w.Code)
		}
		if _, err := appRepo.GetByProgramAndEmail(ctx, prog.ID, "sneaky@outside.test"); err == nil {
			t.Fatalf("expected no fellow record to be created")
		}
	})
}
