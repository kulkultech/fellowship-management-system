package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func newUserRepairTestHandler() (*handler.AdminHandler, *repository.UserRepository, *repository.OrgRepository) {
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	h := handler.NewAdminHandler(
		repository.NewApplicantRepository(nil),
		repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil),
		repository.NewQuestionSetRepository(nil),
		repository.NewTrackRepository(nil),
		repository.NewAIInterviewRepository(nil),
		repository.NewProgramRepository(nil),
		orgRepo,
		userRepo,
		nil,
		"https://example.test",
	)
	return h, userRepo, orgRepo
}

// A wiped company admin (role=candidate, no org) must be restorable via relink.
func TestAdminHandler_RelinkUserRestoresCompanyAdmin(t *testing.T) {
	h, userRepo, orgRepo := newUserRepairTestHandler()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "lit-demo", "LIT Demo Co", "hello@lit-demo.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}
	if _, err := userRepo.Create(ctx, "hello@lit-demo.test", "", "Demo Admin", "candidate", nil); err != nil {
		t.Fatalf("failed to seed wiped user: %v", err)
	}

	body, _ := json.Marshal(map[string]string{
		"email":    "hello@lit-demo.test",
		"org_slug": "lit-demo",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/relink", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.RelinkUser(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	restored, err := userRepo.GetByEmail(ctx, "hello@lit-demo.test")
	if err != nil {
		t.Fatalf("failed to fetch relinked user: %v", err)
	}
	if restored.Role != "org_admin" {
		t.Errorf("expected role org_admin, got %q", restored.Role)
	}
	if restored.OrganizationID == nil || *restored.OrganizationID != org.ID {
		t.Errorf("expected organization link to %s, got %v", org.ID, restored.OrganizationID)
	}
}

func TestAdminHandler_RelinkUserValidation(t *testing.T) {
	h, _, _ := newUserRepairTestHandler()

	cases := []struct {
		name       string
		payload    map[string]string
		wantStatus int
	}{
		{"missing fields", map[string]string{}, http.StatusBadRequest},
		{"unknown user", map[string]string{"email": "ghost@example.com", "org_slug": "rsa"}, http.StatusNotFound},
		{"unknown org", map[string]string{"email": "admin@rsa.org", "org_slug": "nope"}, http.StatusNotFound},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(tc.payload)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/relink", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.RelinkUser(w, req)

			if w.Code != tc.wantStatus {
				t.Errorf("expected status %d, got %d: %s", tc.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

func TestAdminHandler_LookupUser(t *testing.T) {
	h, _, _ := newUserRepairTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users/lookup?email=admin@rsa.org", nil)
	w := httptest.NewRecorder()

	h.LookupUser(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		User map[string]any `json:"user"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp.User["role"] != "org_admin" {
		t.Errorf("expected seeded role org_admin, got %v", resp.User["role"])
	}
	if _, leaked := resp.User["password_hash"]; leaked {
		t.Errorf("password hash must not be exposed by lookup")
	}
}
