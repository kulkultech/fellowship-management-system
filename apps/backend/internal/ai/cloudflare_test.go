package ai_test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/ai"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/model"
)

func TestCloudflareEvaluator_SynthesizeSpeech_EmptyText(t *testing.T) {
	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())
	_, _, err := evaluator.SynthesizeSpeech(context.Background(), "", "")
	if err == nil {
		t.Fatal("expected error for empty text, got nil")
	}
}

func TestCloudflareEvaluator_SynthesizeSpeech_Live(t *testing.T) {
	accountID := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	apiKey := os.Getenv("CLOUDFLARE_API_KEY")
	if accountID == "" || apiKey == "" {
		t.Skip("Skipping live Cloudflare TTS test: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_KEY not set")
	}

	cfg := config.CloudflareConfig{
		AccountID: accountID,
		APIKey:    apiKey,
	}
	evaluator := ai.NewCloudflareEvaluator(cfg, slog.Default())

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	audioData, contentType, err := evaluator.SynthesizeSpeech(ctx, "Welcome to your AI technical interview.", "asteria")
	if err != nil {
		t.Fatalf("SynthesizeSpeech failed: %v", err)
	}

	if contentType != "audio/mpeg" {
		t.Errorf("expected content-type audio/mpeg, got %s", contentType)
	}

	if len(audioData) < 100 {
		t.Errorf("audio data too small: %d bytes", len(audioData))
	}

	// Test cache hit on second call
	cachedData, cachedType, err := evaluator.SynthesizeSpeech(ctx, "Welcome to your AI technical interview.", "asteria")
	if err != nil {
		t.Fatalf("Cached SynthesizeSpeech failed: %v", err)
	}
	if len(cachedData) != len(audioData) || cachedType != contentType {
		t.Errorf("cached audio mismatch")
	}
}

func TestCloudflareEvaluator_AssessAnswerAndGenerateFollowUp_BriefAnswer(t *testing.T) {
	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())

	q := model.DefaultLITRubric().Questions[0]
	conv := []model.ChatMessage{
		{
			Role:    "candidate",
			Message: "I'm ragil",
		},
	}

	isSufficient, followUp, _, err := evaluator.AssessAnswerAndGenerateFollowUp(context.Background(), q, conv, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if isSufficient {
		t.Errorf("expected isSufficient = false for brief response 'I'm ragil', got true")
	}

	if followUp == "" {
		t.Errorf("expected followUp question to be generated, got empty string")
	}
}

func TestCloudflareEvaluator_TranscribeAudio_Empty(t *testing.T) {
	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())
	_, err := evaluator.TranscribeAudio(context.Background(), nil, "audio/webm")
	if err == nil {
		t.Fatal("expected error for empty audio, got nil")
	}
}

func TestCloudflareEvaluator_TranscribeAudio_Live(t *testing.T) {
	accountID := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	apiKey := os.Getenv("CLOUDFLARE_API_KEY")
	if accountID == "" || apiKey == "" {
		t.Skip("Skipping live Cloudflare test")
	}

	cfg := config.CloudflareConfig{
		AccountID: accountID,
		APIKey:    apiKey,
	}
	evaluator := ai.NewCloudflareEvaluator(cfg, slog.Default())

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	audioData, contentType, err := evaluator.SynthesizeSpeech(ctx, "Hello I am excited for the fellowship.", "asteria")
	if err != nil {
		t.Fatalf("SynthesizeSpeech failed: %v", err)
	}

	transcribed, err := evaluator.TranscribeAudio(ctx, audioData, contentType)
	if err != nil {
		t.Fatalf("TranscribeAudio failed: %v", err)
	}

	t.Logf("Transcribed result: %q", transcribed)
	if transcribed == "" {
		t.Errorf("expected non-empty transcript, got empty")
	}
}

func TestCloudflareEvaluator_TranscribeAudio_TinyEn(t *testing.T) {
	accountID := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	apiKey := os.Getenv("CLOUDFLARE_API_KEY")
	if accountID == "" || apiKey == "" {
		t.Skip("Skipping live Cloudflare test")
	}

	cfg := config.CloudflareConfig{
		AccountID: accountID,
		APIKey:    apiKey,
	}
	evaluator := ai.NewCloudflareEvaluator(cfg, slog.Default())

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	audioData, contentType, err := evaluator.SynthesizeSpeech(ctx, "Hello I am excited for the fellowship.", "asteria")
	if err != nil {
		t.Fatalf("SynthesizeSpeech failed: %v", err)
	}

	// Test tiny-en model
	apiURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/openai/whisper-tiny-en", accountID)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(audioData))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", contentType)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	t.Logf("tiny-en status: %d, body: %s", resp.StatusCode, string(body))
}
