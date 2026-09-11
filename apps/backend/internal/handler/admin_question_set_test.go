package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func newQuestionSetTestHandler() (*handler.AdminHandler, *repository.QuestionSetRepository, *repository.OrgRepository) {
	orgRepo := repository.NewOrgRepository(nil)
	qsetRepo := repository.NewQuestionSetRepository(nil)
	h := handler.NewAdminHandler(
		repository.NewApplicantRepository(nil),
		repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil),
		qsetRepo,
		repository.NewTrackRepository(nil),
		repository.NewAIInterviewRepository(nil),
		repository.NewProgramRepository(nil),
		orgRepo,
		repository.NewUserRepository(nil),
		nil,
		"https://example.test",
	)
	return h, qsetRepo, orgRepo
}

func TestAdminHandler_CreateAndListQuestionSet_Superadmin(t *testing.T) {
	h, _, orgRepo := newQuestionSetTestHandler()
	ctx := context.Background()

	// Seed RSA organization
	_, err := orgRepo.Register(ctx, "rsa", "Acme Academy", "contact@rsa.org", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to seed rsa org: %v", err)
	}

	// 1. Superadmin creates question set with no explicit org (should fallback to rsa)
	claims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "superadmin@fellowhire.com",
		Role:   "superadmin",
	}

	createPayload := map[string]any{
		"name":             "Algorithms & Data Structures Bank",
		"category":         "Software Engineering",
		"duration_minutes": 45,
		"passing_score":    75,
	}
	body, _ := json.Marshal(createPayload)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/question-sets", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithUser(req.Context(), claims))
	w := httptest.NewRecorder()

	h.CreateQuestionSet(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var created model.QuestionSet
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if created.Name != "Algorithms & Data Structures Bank" {
		t.Fatalf("unexpected set name: %s", created.Name)
	}
	if created.OrganizationID == nil {
		t.Fatalf("expected non-nil OrganizationID attached to set")
	}

	// 2. Superadmin lists question sets (should include the newly created set)
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/question-sets", nil)
	listReq = listReq.WithContext(middleware.WithUser(listReq.Context(), claims))
	listW := httptest.NewRecorder()

	h.ListQuestionSets(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", listW.Code, listW.Body.String())
	}

	var listRes struct {
		QuestionSets []model.QuestionSet `json:"question_sets"`
		Total        int                 `json:"total"`
	}
	if err := json.Unmarshal(listW.Body.Bytes(), &listRes); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}

	found := false
	for _, qs := range listRes.QuestionSets {
		if qs.ID == created.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("created question set %s was not found in listed question sets", created.ID)
	}
}

func TestAdminHandler_CreateQuestionSet_InvalidOrgGracefulFallback(t *testing.T) {
	h, _, _ := newQuestionSetTestHandler()

	claims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "superadmin@fellowhire.com",
		Role:   "superadmin",
	}

	// Pass a deleted or non-existent org_id
	invalidOrgID := "00000000-0000-0000-0000-000000000099"
	createPayload := map[string]any{
		"organization_id":  invalidOrgID,
		"name":             "Edge Case Screening Set",
		"category":         "QA",
		"duration_minutes": 30,
		"passing_score":    70,
	}
	body, _ := json.Marshal(createPayload)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/question-sets?org_id="+invalidOrgID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithUser(req.Context(), claims))
	w := httptest.NewRecorder()

	h.CreateQuestionSet(w, req)

	// Must NOT crash or return 500 foreign key violation; must gracefully fall back to default rsa org
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created with graceful fallback, got %d: %s", w.Code, w.Body.String())
	}

	var created model.QuestionSet
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if created.OrganizationID == nil || created.OrganizationID.String() == invalidOrgID {
		t.Fatalf("expected fallback org ID, got %v", created.OrganizationID)
	}
}
