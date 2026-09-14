package handler_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/ai"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/pkg/storage"
)

func TestAIInterviewHandler_ResetSession_RetryFlow(t *testing.T) {
	aiRepo := repository.NewAIInterviewRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	localStorage, _ := storage.NewLocalStorage(t.TempDir())

	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())
	h := handler.NewAIInterviewHandler(aiRepo, appRepo, progRepo, trackRepo, evaluator, localStorage)

	// Setup applicant & non-demo interview session
	appID := uuid.New()
	progID := uuid.New()
	token := "candidate-real-invite-token"

	aiSession, err := aiRepo.CreateInvitationWithTrack(context.Background(), appID, progID, nil, token, time.Now().Add(24*time.Hour))
	if err != nil || aiSession == nil {
		t.Fatalf("failed to create interview invitation: %v", err)
	}

	// Simulate candidate answering Question 1 then closing tab mid-interview
	startedAt := time.Now()
	zeroIdx := 0
	partialTranscript := []model.ChatMessage{
		{Role: "ai", Message: "Welcome! Tell us about yourself.", QuestionIndex: &zeroIdx},
		{Role: "candidate", Message: "I am a software engineer.", QuestionIndex: &zeroIdx},
	}
	_ = aiRepo.UpdateSession(context.Background(), aiSession.ID, &startedAt, nil, partialTranscript, nil, 0, model.AIInterviewInProgress)

	// Verify session is currently in_progress
	curr, _ := aiRepo.GetByToken(context.Background(), token)
	if curr.Status != model.AIInterviewInProgress || len(curr.Transcript) != 2 {
		t.Fatalf("expected in_progress with 2 messages, got status=%s len=%d", curr.Status, len(curr.Transcript))
	}

	// Candidate reopens page and clicks "Enter Chamber" -> triggers ResetSession
	req := httptest.NewRequest(http.MethodPost, "/interviews/"+token+"/reset", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("inviteToken", token)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()

	h.ResetSession(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 on in-progress reset, got %d: %s", w.Code, w.Body.String())
	}

	var resetResp handler.AIInterviewSessionResponse
	if err := json.NewDecoder(w.Body).Decode(&resetResp); err != nil {
		t.Fatalf("failed to decode reset response: %v", err)
	}

	// Check that previous partial candidate answer was wiped and session was seeded fresh
	if resetResp.RecordingStatus != "pending" {
		t.Errorf("expected recording_status='pending', got '%s'", resetResp.RecordingStatus)
	}
	if resetResp.RecordingURL != "" {
		t.Errorf("expected empty recording_url, got '%s'", resetResp.RecordingURL)
	}

	// Verify in repository
	updated, _ := aiRepo.GetByToken(context.Background(), token)
	if updated.RecordingURL != "" {
		t.Errorf("expected empty recording_url in repo, got '%s'", updated.RecordingURL)
	}

	// Now complete the session
	now := time.Now()
	_ = aiRepo.UpdateSession(context.Background(), aiSession.ID, nil, &now, nil, nil, 85, model.AIInterviewCompleted)

	// Try resetting completed session -> MUST return 403 Forbidden
	reqCompleted := httptest.NewRequest(http.MethodPost, "/interviews/"+token+"/reset", nil)
	rctxCompleted := chi.NewRouteContext()
	rctxCompleted.URLParams.Add("inviteToken", token)
	reqCompleted = reqCompleted.WithContext(context.WithValue(reqCompleted.Context(), chi.RouteCtxKey, rctxCompleted))
	wCompleted := httptest.NewRecorder()

	h.ResetSession(wCompleted, reqCompleted)

	if wCompleted.Code != http.StatusForbidden {
		t.Fatalf("expected HTTP 403 Forbidden when resetting completed session, got %d: %s", wCompleted.Code, wCompleted.Body.String())
	}
}
