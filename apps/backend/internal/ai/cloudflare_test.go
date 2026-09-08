package ai_test

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/ai"
	"github.com/kulkul/backend/internal/config"
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
