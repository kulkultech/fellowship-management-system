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

func newEmailTemplatesTestHandler() (*handler.AdminHandler, *repository.ProgramRepository, *repository.OrgRepository) {
	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	h := handler.NewAdminHandler(
		repository.NewApplicantRepository(nil),
		repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil),
		repository.NewQuestionSetRepository(nil),
		repository.NewTrackRepository(nil),
		repository.NewAIInterviewRepository(nil),
		progRepo,
		orgRepo,
		repository.NewUserRepository(nil),
		nil,
		"https://example.test",
	)
	return h, progRepo, orgRepo
}

func TestAdminHandler_ProgramEmailTemplates_GetAndUpdate(t *testing.T) {
	h, progRepo, orgRepo := newEmailTemplatesTestHandler()
	ctx := context.Background()

	org, err := orgRepo.Register(ctx, "acme-corp", "Acme Corp", "admin@acme.test", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	prog, err := progRepo.Create(ctx, &model.Program{
		ID:             uuid.New(),
		OrganizationID: org.ID,
		Slug:           "eng-fellowship",
		Name:           "Engineering Fellowship",
		Description:    "Program description",
		OpenDate:       time.Now(),
		EndDate:        time.Now().Add(30 * 24 * time.Hour),
		Status:         "published",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	claims := &auth.Claims{
		UserID:         uuid.New(),
		Email:          "admin@acme.test",
		Role:           "org_admin",
		OrganizationID: &org.ID,
	}

	router := chi.NewRouter()
	router.Get("/programs/{id}/email-templates", h.GetProgramEmailTemplates)
	router.Put("/programs/{id}/email-templates", h.UpdateProgramEmailTemplates)
	router.Post("/programs/{id}/email-templates/test", h.SendTestProgramEmail)

	// 1. GET email templates when none stored -> returns default templates
	{
		req := httptest.NewRequest(http.MethodGet, "/programs/"+prog.ID.String()+"/email-templates", nil)
		req = req.WithContext(middleware.WithUser(req.Context(), claims))

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var templates model.ProgramEmailTemplates
		if err := json.Unmarshal(rec.Body.Bytes(), &templates); err != nil {
			t.Fatalf("failed to unmarshal templates response: %v", err)
		}

		if templates.ApplicationReceived == nil || !templates.ApplicationReceived.Enabled {
			t.Fatalf("expected application_received template to be present and enabled by default")
		}
		if templates.Rejection == nil || !templates.Rejection.Enabled {
			t.Fatalf("expected rejection template to be present and enabled by default")
		}
	}

	// 2. PUT email templates with customized subject & headline
	{
		customTemplates := model.DefaultProgramEmailTemplates(prog.Name)
		customTemplates.ApplicationReceived.Subject = "Welcome aboard! Next step: {{program_name}}"
		customTemplates.ApplicationReceived.Headline = "Excited to meet you, {{candidate_name}}!"
		customTemplates.Rejection.Headline = "Thank you for applying to {{program_name}}"

		bodyBytes, _ := json.Marshal(customTemplates)
		req := httptest.NewRequest(http.MethodPut, "/programs/"+prog.ID.String()+"/email-templates", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithUser(req.Context(), claims))

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var savedTemplates model.ProgramEmailTemplates
		if err := json.Unmarshal(rec.Body.Bytes(), &savedTemplates); err != nil {
			t.Fatalf("failed to unmarshal updated response: %v", err)
		}

		if savedTemplates.ApplicationReceived.Subject != "Welcome aboard! Next step: {{program_name}}" {
			t.Fatalf("expected custom subject saved, got %s", savedTemplates.ApplicationReceived.Subject)
		}
	}

	// 3. POST /programs/{id}/email-templates/test (Send test email)
	{
		testReqPayload := map[string]any{
			"type":            "application_received",
			"recipient_email": "tester@example.com",
			"template": model.EmailTemplateConfig{
				Enabled:    true,
				Subject:    "Test subject for {{candidate_name}}",
				Headline:   "Test headline",
				Body:       "Test body with {{program_name}}.",
				ButtonText: "Take Test",
			},
		}

		bodyBytes, _ := json.Marshal(testReqPayload)
		req := httptest.NewRequest(http.MethodPost, "/programs/"+prog.ID.String()+"/email-templates/test", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithUser(req.Context(), claims))

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}
	}
}
