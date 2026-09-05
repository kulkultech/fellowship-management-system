package server_test

import (
	"bytes"
	"context"
	"io"
	"os"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/pkg/storage"
)

func TestCloudflareR2_LiveUploadAndRetrieve(t *testing.T) {
	accountID := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	apiKey := os.Getenv("CLOUDFLARE_API_KEY")
	if accountID == "" || apiKey == "" {
		t.Skip("skipping live Cloudflare R2 test; CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_KEY not set")
	}

	bucket := os.Getenv("R2_BUCKET")
	if bucket == "" {
		bucket = "fellowhire"
	}

	cfg := config.StorageConfig{
		Provider:    "r2",
		R2AccountID: accountID,
		R2APIKey:    apiKey,
		R2Bucket:    bucket,
	}

	store, err := storage.New(cfg)
	if err != nil {
		t.Fatalf("failed to init storage: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	testContent := []byte("live-r2-integration-test-" + time.Now().Format(time.RFC3339))
	key := "test/integration_test.txt"

	url, err := store.Upload(ctx, key, bytes.NewReader(testContent), int64(len(testContent)), "text/plain")
	if err != nil {
		t.Fatalf("live upload to Cloudflare R2 failed: %v", err)
	}
	t.Logf("Uploaded to R2: %s", url)

	rc, cType, _, err := store.Get(ctx, key)
	if err != nil {
		t.Fatalf("failed to retrieve from Cloudflare R2: %v", err)
	}
	defer rc.Close()
	t.Logf("Retrieved content type: %s", cType)

	body, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("failed to read body: %v", err)
	}
	if !bytes.Equal(body, testContent) {
		t.Fatalf("content mismatch, expected %s, got %s", string(testContent), string(body))
	}

	// Clean up
	_ = store.Delete(ctx, key)
}
