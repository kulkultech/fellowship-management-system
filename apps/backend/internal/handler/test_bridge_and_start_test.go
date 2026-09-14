package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func newTestBridgeTestHandler() (*handler.TestHandler, *repository.SubmissionRepository, *repository.ProgramRepository, *repository.MCQRepository, *repository.ApplicantRepository) {
	subRepo := repository.NewSubmissionRepository(nil)
	mcqRepo := repository.NewMCQRepository(nil)
	qSetRepo := repository.NewQuestionSetRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	aiRepo := repository.NewAIInterviewRepository(nil)

	h := handler.NewTestHandler(
		subRepo,
		mcqRepo,
		qSetRepo,
		progRepo,
		trackRepo,
		appRepo,
		aiRepo,
		nil,
		"https://example.test",
	)
	return h, subRepo, progRepo, mcqRepo, appRepo
}

func TestTestHandler_BridgeInfoAndStartTest(t *testing.T) {
	h, subRepo, progRepo, mcqRepo, appRepo := newTestBridgeTestHandler()
	ctx := context.Background()

	// Create Program
	orgID := uuid.New()
	prog, err := progRepo.Create(ctx, &model.Program{
		ID:                       uuid.New(),
		OrganizationID:           orgID,
		Slug:                     "lit-2026",
		Name:                     "LIT 2026",
		Description:              "Engineering Fellowship",
		OpenDate:                 time.Now(),
		EndDate:                  time.Now().Add(30 * 24 * time.Hour),
		EnableMCQ:                true,
		LogicTestDurationMinutes: 35,
		LogicTestPassingScore:    75,
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// Create MCQ Questions
	_, _ = mcqRepo.Create(ctx, &model.MCQQuestion{
		ID:            uuid.New(),
		ProgramID:     prog.ID,
		Category:      "General",
		QuestionText:  "What is 2+2?",
		Options: []model.MCQOption{
			{ID: "opt1", Text: "3"},
			{ID: "opt2", Text: "4"},
		},
		CorrectOptionID: "opt2",
		Points:          10,
		Explanation:     "Math fact",
	})

	// Create Applicant
	app, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
		ID:             uuid.New(),
		OrganizationID: orgID,
		ProgramID:      prog.ID,
		Email:          "candidate@example.com",
		FullName:       "Test Candidate",
	})
	if err != nil {
		t.Fatalf("failed to create applicant: %v", err)
	}

	// Create Submission (starts in pending)
	testToken := "test-token-bridge-xyz"
	sub, err := subRepo.Create(ctx, app.ID, prog.ID, testToken)
	if err != nil {
		t.Fatalf("failed to create submission: %v", err)
	}
	if sub.Status != model.SubmissionPending {
		t.Errorf("expected initial status pending, got %v", sub.Status)
	}

	// 1. GetTestSession (Bridge Page loading)
	r := chi.NewRouter()
	r.Get("/tests/{testToken}", h.GetTestSession)
	r.Post("/tests/{testToken}/start", h.StartTest)

	req := httptest.NewRequest(http.MethodGet, "/tests/"+testToken, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from GetTestSession, got %d: %s", w.Code, w.Body.String())
	}

	var sessionResp handler.TestSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&sessionResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if sessionResp.DurationMinutes != 35 {
		t.Errorf("expected DurationMinutes 35, got %d", sessionResp.DurationMinutes)
	}
	if sessionResp.PassingScore != 75 {
		t.Errorf("expected PassingScore 75, got %d", sessionResp.PassingScore)
	}
	if sessionResp.QuestionCount != len(sessionResp.Questions) || sessionResp.QuestionCount == 0 {
		t.Errorf("expected QuestionCount to match questions length, got %d vs %d", sessionResp.QuestionCount, len(sessionResp.Questions))
	}
	if sessionResp.Status != model.SubmissionPending {
		t.Errorf("expected status pending, got %s", sessionResp.Status)
	}
	if sessionResp.RemainingSeconds != 35*60 {
		t.Errorf("expected full remaining seconds %d, got %d", 35*60, sessionResp.RemainingSeconds)
	}

	// 2. StartTest (Click "Begin Assessment" on Bridge Page)
	startReq := httptest.NewRequest(http.MethodPost, "/tests/"+testToken+"/start", nil)
	startW := httptest.NewRecorder()
	r.ServeHTTP(startW, startReq)

	if startW.Code != http.StatusOK {
		t.Fatalf("expected 200 from StartTest, got %d: %s", startW.Code, startW.Body.String())
	}

	var startedResp handler.TestSessionResponse
	if err := json.NewDecoder(startW.Body).Decode(&startedResp); err != nil {
		t.Fatalf("failed to decode started response: %v", err)
	}

	if startedResp.Status != model.SubmissionInProgress {
		t.Errorf("expected status in_progress after start, got %s", startedResp.Status)
	}
	if startedResp.RemainingSeconds < 35*60-5 || startedResp.RemainingSeconds > 35*60 {
		t.Errorf("expected remaining seconds around %d, got %d", 35*60, startedResp.RemainingSeconds)
	}

	// 3. Simulate candidate closing the page for 10 minutes:
	// Shift started_at back by 10 minutes in repository
	pastStart := time.Now().Add(-10 * time.Minute)
	_ = subRepo.StartSubmission(ctx, sub.ID, pastStart)

	// Candidate reopens page: calls GetTestSession
	reqReopen := httptest.NewRequest(http.MethodGet, "/tests/"+testToken, nil)
	wReopen := httptest.NewRecorder()
	r.ServeHTTP(wReopen, reqReopen)

	if wReopen.Code != http.StatusOK {
		t.Fatalf("expected 200 on reopen, got %d", wReopen.Code)
	}

	var reopenResp handler.TestSessionResponse
	if err := json.NewDecoder(wReopen.Body).Decode(&reopenResp); err != nil {
		t.Fatalf("failed to decode reopen response: %v", err)
	}

	if reopenResp.Status != model.SubmissionInProgress {
		t.Errorf("expected status in_progress on reopen, got %s", reopenResp.Status)
	}
	// Total duration was 35m = 2100s. After 10m (600s), remaining should be ~1500s (25 mins).
	expectedRemaining := 25 * 60
	if reopenResp.RemainingSeconds < expectedRemaining-5 || reopenResp.RemainingSeconds > expectedRemaining+5 {
		t.Errorf("expected remaining seconds ~%d after 10m elapsed, got %d", expectedRemaining, reopenResp.RemainingSeconds)
	}

	// Verify that calling StartTest again DOES NOT reset the timer
	startReq2 := httptest.NewRequest(http.MethodPost, "/tests/"+testToken+"/start", nil)
	startW2 := httptest.NewRecorder()
	r.ServeHTTP(startW2, startReq2)

	var startedResp2 handler.TestSessionResponse
	_ = json.NewDecoder(startW2.Body).Decode(&startedResp2)
	if startedResp2.RemainingSeconds < expectedRemaining-5 || startedResp2.RemainingSeconds > expectedRemaining+5 {
		t.Errorf("expected timer not to be reset on redundant start, got %d seconds remaining", startedResp2.RemainingSeconds)
	}

	// 4. Simulate candidate reopening page after 40 minutes (duration exceeded):
	expiredStart := time.Now().Add(-40 * time.Minute)
	_ = subRepo.StartSubmission(ctx, sub.ID, expiredStart)

	reqExpired := httptest.NewRequest(http.MethodGet, "/tests/"+testToken, nil)
	wExpired := httptest.NewRecorder()
	r.ServeHTTP(wExpired, reqExpired)

	var expiredResp handler.TestSessionResponse
	_ = json.NewDecoder(wExpired.Body).Decode(&expiredResp)
	if expiredResp.RemainingSeconds != 0 {
		t.Errorf("expected 0 remaining seconds for expired session, got %d", expiredResp.RemainingSeconds)
	}
	if expiredResp.Status != model.SubmissionExpired {
		t.Errorf("expected expired status, got %s", expiredResp.Status)
	}
}
