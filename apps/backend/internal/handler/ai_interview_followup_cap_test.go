package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestAIInterviewHandler_SendMessage_MaxTwoFollowUps(t *testing.T) {
	aiRepo := repository.NewAIInterviewRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	store, _ := storage.NewLocalStorage("/tmp/test-uploads")

	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())
	h := handler.NewAIInterviewHandler(aiRepo, appRepo, progRepo, trackRepo, evaluator, store)

	token := "test-candidate-token-" + uuid.New().String()
	appID := uuid.New()
	progID := uuid.New()

	// Create test program
	prog := &model.Program{
		ID:             progID,
		OrganizationID: uuid.New(),
		Name:           "Test Fellowship",
		Slug:           "test-fellowship",
		AIInterviewRubric: &model.AIInterviewRubric{
			Questions: []model.AIInterviewQuestionItem{
				{
					ID:       1,
					Theme:    "Self-introduction",
					Question: "Please introduce yourself.",
				},
				{
					ID:       2,
					Theme:    "Technical Challenge",
					Question: "Describe a technical challenge.",
				},
			},
		},
	}
	_, _ = progRepo.Create(context.Background(), prog)

	// Create interview session
	_, err := aiRepo.CreateInvitationWithTrack(context.Background(), appID, progID, nil, token, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("failed to create interview session: %v", err)
	}

	sendMsg := func(message string, qIdx int, followUpCount int) handler.SendMessageResponse {
		reqBody := handler.SendMessageRequest{
			Message:              message,
			CurrentQuestionIndex: qIdx,
			FollowUpCount:        followUpCount,
		}
		bodyBytes, _ := json.Marshal(reqBody)

		r := httptest.NewRequest(http.MethodPost, "/interviews/"+token+"/message", bytes.NewReader(bodyBytes))
		r.Header.Set("Content-Type", "application/json")
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("inviteToken", token)
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

		w := httptest.NewRecorder()
		h.SendMessage(w, r)

		if w.Code != http.StatusOK {
			t.Fatalf("SendMessage returned %d: %s", w.Code, w.Body.String())
		}

		var resp handler.SendMessageResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		return resp
	}

	// Turn 1: Main answer lacking detail -> fallback follow-up 1
	resp1 := sendMsg("Hi, I'm Bob.", 0, 0)
	if !resp1.IsFollowUp {
		t.Errorf("expected follow-up 1 for short answer, got is_follow_up=false")
	}
	if resp1.FollowUpCount != 1 {
		t.Errorf("expected follow_up_count=1, got %d", resp1.FollowUpCount)
	}
	if resp1.CurrentQuestionIndex != 0 {
		t.Errorf("expected current_question_index=0, got %d", resp1.CurrentQuestionIndex)
	}

	// Turn 2: Reply to follow-up 1, still brief -> fallback follow-up 2
	resp2 := sendMsg("I code in Go.", 0, 1)
	if !resp2.IsFollowUp {
		t.Errorf("expected follow-up 2, got is_follow_up=false")
	}
	if resp2.FollowUpCount != 2 {
		t.Errorf("expected follow_up_count=2, got %d", resp2.FollowUpCount)
	}
	if resp2.CurrentQuestionIndex != 0 {
		t.Errorf("expected current_question_index=0, got %d", resp2.CurrentQuestionIndex)
	}

	// Turn 3: Reply to follow-up 2 -> MUST ADVANCE TO QUESTION 1 (HARD CAP: max 2 follow-ups)
	resp3 := sendMsg("And I love databases.", 0, 2)
	if resp3.IsFollowUp {
		t.Errorf("expected is_follow_up=false after 2 follow-ups, got true!")
	}
	if resp3.CurrentQuestionIndex != 1 {
		t.Errorf("expected current_question_index=1 (next question), got %d", resp3.CurrentQuestionIndex)
	}
	if resp3.FollowUpCount != 0 {
		t.Errorf("expected follow_up_count=0 for new question, got %d", resp3.FollowUpCount)
	}

	// Test client-sent followUpCount >= 2 override
	respOverride := sendMsg("Short turn", 1, 2)
	if respOverride.IsFollowUp {
		t.Errorf("expected client followUpCount=2 to prevent follow-up, got is_follow_up=true")
	}
}

func TestAIInterviewHandler_SendMessage_CandidateNameAndQuestionIsolation(t *testing.T) {
	aiRepo := repository.NewAIInterviewRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	store, _ := storage.NewLocalStorage("/tmp/test-uploads")

	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())
	h := handler.NewAIInterviewHandler(aiRepo, appRepo, progRepo, trackRepo, evaluator, store)

	token := "test-candidate-name-token-" + uuid.New().String()
	appID := uuid.New()
	progID := uuid.New()

	prog := &model.Program{
		ID:             progID,
		OrganizationID: uuid.New(),
		Name:           "Engineering Program",
		AIInterviewRubric: &model.AIInterviewRubric{
			Questions: []model.AIInterviewQuestionItem{
				{
					ID:       1,
					Theme:    "Self-introduction",
					Question: "Tell me about yourself.",
				},
				{
					ID:       2,
					Theme:    "System Design",
					Question: "How do you design a scalable cache?",
				},
			},
		},
	}
	_, _ = progRepo.Create(context.Background(), prog)

	// Create applicant with known first name
	applicant := &model.Applicant{
		ID:             appID,
		OrganizationID: prog.OrganizationID,
		ProgramID:      progID,
		FirstName:      "Ragil",
		FullName:       "Ragil Zakaria",
		Email:          "ragil@kulkul.tech",
	}
	_, _, _ = appRepo.CreateOrGet(context.Background(), applicant)

	_, err := aiRepo.CreateInvitationWithTrack(context.Background(), appID, progID, nil, token, time.Now().Add(24*time.Hour))
	if err != nil {
		t.Fatalf("failed to create interview session: %v", err)
	}

	sendMsg := func(message string, qIdx int, followUpCount int, candName string) handler.SendMessageResponse {
		reqBody := handler.SendMessageRequest{
			Message:              message,
			CurrentQuestionIndex: qIdx,
			FollowUpCount:        followUpCount,
			CandidateName:        candName,
		}
		bodyBytes, _ := json.Marshal(reqBody)

		r := httptest.NewRequest(http.MethodPost, "/interviews/"+token+"/message", bytes.NewReader(bodyBytes))
		r.Header.Set("Content-Type", "application/json")
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("inviteToken", token)
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

		w := httptest.NewRecorder()
		h.SendMessage(w, r)

		if w.Code != http.StatusOK {
			t.Fatalf("SendMessage returned %d: %s", w.Code, w.Body.String())
		}

		var resp handler.SendMessageResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		return resp
	}

	// Turn 1 on Question 0 with short answer: follow-up should address "Ragil"
	resp1 := sendMsg("Hello", 0, 0, "Ragil")
	if !resp1.IsFollowUp {
		t.Errorf("expected follow-up, got is_follow_up=false")
	}
	if !strings.Contains(resp1.AIMessage, "Ragil") {
		t.Errorf("expected follow-up to address candidate 'Ragil', got %q", resp1.AIMessage)
	}

	// Turn 2 with substantive answer: advance to Question 1 and address "Ragil"
	longAnswer := "I have five years of experience building distributed backend systems in Go and PostgreSQL, with automated CI/CD deployment pipelines."
	resp2 := sendMsg(longAnswer, 0, 1, "Ragil")
	if resp2.IsFollowUp {
		t.Errorf("expected substantive answer to advance to question 1, got follow-up: %s", resp2.AIMessage)
	}
	if resp2.CurrentQuestionIndex != 1 {
		t.Errorf("expected current_question_index=1, got %d", resp2.CurrentQuestionIndex)
	}
	if !strings.Contains(resp2.AIMessage, "Ragil") {
		t.Errorf("expected next question transition to address candidate 'Ragil', got %q", resp2.AIMessage)
	}
}
