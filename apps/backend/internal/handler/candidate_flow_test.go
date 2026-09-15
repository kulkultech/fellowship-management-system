package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestCandidateFlow_MCQFirstEndToEnd(t *testing.T) {
	ctx := context.Background()

	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	mcqRepo := repository.NewMCQRepository(nil)
	qSetRepo := repository.NewQuestionSetRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	subRepo := repository.NewSubmissionRepository(nil)
	aiRepo := repository.NewAIInterviewRepository(nil)
	userRepo := repository.NewUserRepository(nil)

	// Create Organization
	org, err := orgRepo.Create(ctx, "apex", "Apex Innovations", "")
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	// Create Program with default flow
	prog, err := progRepo.Create(ctx, &model.Program{
		OrganizationID:           org.ID,
		Slug:                     "apex-fellowship-2026",
		Name:                     "Apex Fellowship 2026",
		Description:              "High performance fellowship",
		OpenDate:                 time.Now().Add(-24 * time.Hour),
		EndDate:                  time.Now().Add(30 * 24 * time.Hour),
		EnableMCQ:                true,
		LogicTestDurationMinutes: 30,
		LogicTestPassingScore:    70,
		EnableAIInterview:        true,
	})
	if err != nil {
		t.Fatalf("create prog: %v", err)
	}

	// 1. Admin configures candidate flow: MCQ first, then form, then AI interview
	newFlow := []string{model.FlowStepMCQ, model.FlowStepForm, model.FlowStepAIInterview}
	updatedProg, err := progRepo.UpdateCandidateFlow(ctx, prog.ID, newFlow)
	if err != nil {
		t.Fatalf("update candidate flow: %v", err)
	}
	if len(updatedProg.CandidateFlow) != 3 || updatedProg.CandidateFlow[0] != model.FlowStepMCQ {
		t.Fatalf("expected candidate_flow[0] = mcq_test, got %v", updatedProg.CandidateFlow)
	}

	// Verify Application Stages were also auto-synchronized with MCQ before Form
	if len(updatedProg.ApplicationStages) < 2 || !strings.Contains(strings.ToLower(updatedProg.ApplicationStages[0].Title), "logic") {
		t.Fatalf("expected first application stage to be logic test, got %v", updatedProg.ApplicationStages[0])
	}

	// 2. Candidate initiates program via StartProgram
	progH := handler.NewProgramHandler(orgRepo, progRepo, trackRepo, mcqRepo, appRepo, subRepo, aiRepo, userRepo, nil, "https://fellowhire.kul.to")
	testH := handler.NewTestHandler(subRepo, mcqRepo, qSetRepo, progRepo, trackRepo, appRepo, aiRepo, orgRepo, nil, "https://fellowhire.kul.to")

	candidateClaims := &auth.Claims{
		UserID: uuid.New(),
		Email:  "jane.candidate@example.com",
		Role:   model.RoleCandidate,
	}

	// Route multiplexer for Chi params
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctxWithUser := middleware.WithUser(req.Context(), candidateClaims)
			next.ServeHTTP(w, req.WithContext(ctxWithUser))
		})
	})
	r.Post("/programs/{orgSlug}/{programSlug}/start", progH.StartProgram)
	r.Get("/programs/{orgSlug}/{programSlug}/candidate-status", progH.GetCandidateStatus)
	r.Post("/tests/{testToken}/submit", testH.SubmitTest)
	r.Get("/tests/{testToken}/result", testH.GetResult)

	// Test StartProgram
	startBody, _ := json.Marshal(map[string]any{})
	startReq := httptest.NewRequest(http.MethodPost, "/programs/apex/apex-fellowship-2026/start", bytes.NewReader(startBody))
	startRec := httptest.NewRecorder()
	r.ServeHTTP(startRec, startReq)

	if startRec.Code != http.StatusOK {
		t.Fatalf("expected 200 from StartProgram, got %d: %s", startRec.Code, startRec.Body.String())
	}

	var startResp handler.StartProgramResponse
	if err := json.Unmarshal(startRec.Body.Bytes(), &startResp); err != nil {
		t.Fatalf("unmarshal start response: %v", err)
	}
	if startResp.CurrentStep != model.FlowStepMCQ {
		t.Fatalf("expected current_step = mcq_test, got %s", startResp.CurrentStep)
	}
	if startResp.TestToken == "" {
		t.Fatalf("expected non-empty test_token")
	}

	// Check candidate status endpoint
	statusReq := httptest.NewRequest(http.MethodGet, "/programs/apex/apex-fellowship-2026/candidate-status", nil)
	statusRec := httptest.NewRecorder()
	r.ServeHTTP(statusRec, statusReq)

	var statusResp handler.CandidateStatusResponse
	_ = json.Unmarshal(statusRec.Body.Bytes(), &statusResp)
	if statusResp.CurrentStep != model.FlowStepMCQ {
		t.Fatalf("expected candidate status current_step = mcq_test, got %s", statusResp.CurrentStep)
	}
	if !statusResp.HasApplied {
		t.Fatalf("expected has_applied = true")
	}

	// 3. Candidate submits test (scored 100%, passed)
	questions, _ := mcqRepo.ListByProgram(ctx, prog.ID)
	var answers []map[string]any
	for _, q := range questions {
		answers = append(answers, map[string]any{
			"question_id":        q.ID.String(),
			"selected_option_id": q.CorrectOptionID,
		})
	}

	submitBody, _ := json.Marshal(map[string]any{
		"answers": answers,
	})
	subReq := httptest.NewRequest(http.MethodPost, "/tests/"+startResp.TestToken+"/submit", bytes.NewReader(submitBody))
	subRec := httptest.NewRecorder()
	r.ServeHTTP(subRec, subReq)

	if subRec.Code != http.StatusOK {
		t.Fatalf("expected 200 from SubmitTest, got %d: %s", subRec.Code, subRec.Body.String())
	}

	var subResp handler.SubmitTestResponse
	_ = json.Unmarshal(subRec.Body.Bytes(), &subResp)
	if !subResp.Passed {
		t.Fatalf("expected test passed, score=%d", subResp.TotalScore)
	}
	// Next step must be fill_form!
	if subResp.NextStep != model.FlowStepForm {
		t.Fatalf("expected next_step after MCQ to be fill_form, got %s", subResp.NextStep)
	}
	if subResp.RedirectURL != "/programs/apex/apex-fellowship-2026/apply" {
		t.Fatalf("expected redirect_url to apply form, got %s", subResp.RedirectURL)
	}

	// 4. Candidate status now shows fill_form as current step
	statusRec2 := httptest.NewRecorder()
	r.ServeHTTP(statusRec2, statusReq)
	var statusResp2 handler.CandidateStatusResponse
	_ = json.Unmarshal(statusRec2.Body.Bytes(), &statusResp2)
	if statusResp2.CurrentStep != model.FlowStepForm {
		t.Fatalf("expected current_step = fill_form after passing MCQ, got %s", statusResp2.CurrentStep)
	}

	// 5. Candidate submits application form
	r.Post("/programs/{orgSlug}/{programSlug}/apply", progH.Apply)
	applyBody, _ := json.Marshal(map[string]any{
		"first_name": "Jane",
		"last_name":  "Candidate",
		"email":      "jane.candidate@example.com",
		"phone":      "+6281234567890",
		"university": "Apex University",
		"major":      "Computer Science",
		"semester":   "Semester 8",
		"resume_url": "https://r2.kul.to/resumes/jane.pdf",
	})
	applyReq := httptest.NewRequest(http.MethodPost, "/programs/apex/apex-fellowship-2026/apply", bytes.NewReader(applyBody))
	applyRec := httptest.NewRecorder()
	r.ServeHTTP(applyRec, applyReq)

	if applyRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 from Apply, got %d: %s", applyRec.Code, applyRec.Body.String())
	}

	var applyResp handler.ApplyResponse
	_ = json.Unmarshal(applyRec.Body.Bytes(), &applyResp)
	if applyResp.NextStep != model.FlowStepAIInterview {
		t.Fatalf("expected next_step after form to be ai_interview, got %s", applyResp.NextStep)
	}
	if applyResp.AIInterviewInviteToken == "" {
		t.Fatalf("expected non-empty AI interview token")
	}

	// 6. Candidate status now shows ai_interview as current step
	statusRec3 := httptest.NewRecorder()
	r.ServeHTTP(statusRec3, statusReq)
	var statusResp3 handler.CandidateStatusResponse
	_ = json.Unmarshal(statusRec3.Body.Bytes(), &statusResp3)
	if statusResp3.CurrentStep != model.FlowStepAIInterview {
		t.Fatalf("expected current_step = ai_interview after submitting form, got %s", statusResp3.CurrentStep)
	}
}

