package storage

import (
	"context"
	"strings"
	"testing"

	"github.com/kulkul/backend/internal/config"
)

func TestLocalStorage_UploadGetDelete(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewLocalStorage(tmpDir)
	if err != nil {
		t.Fatalf("failed to create local storage: %v", err)
	}

	ctx := context.Background()
	content := "test local storage content"
	reader := strings.NewReader(content)

	url, err := store.Upload(ctx, "logos/test_logo.png", reader, int64(len(content)), "image/png")
	if err != nil {
		t.Fatalf("failed to upload: %v", err)
	}
	if url != "/uploads/logos/test_logo.png" {
		t.Fatalf("expected /uploads/logos/test_logo.png, got %s", url)
	}

	rc, cType, size, err := store.Get(ctx, "logos/test_logo.png")
	if err != nil {
		t.Fatalf("failed to get: %v", err)
	}
	defer rc.Close()

	if size != int64(len(content)) {
		t.Errorf("expected size %d, got %d", len(content), size)
	}
	if cType != "image/png" {
		t.Errorf("expected image/png, got %s", cType)
	}

	if err := store.Delete(ctx, "logos/test_logo.png"); err != nil {
		t.Fatalf("failed to delete: %v", err)
	}

	_, _, _, err = store.Get(ctx, "logos/test_logo.png")
	if err == nil {
		t.Fatalf("expected error after delete, got nil")
	}
}

func TestStorageFactory_R2Fallback(t *testing.T) {
	cfg := config.StorageConfig{
		Provider:    "r2",
		R2AccountID: "test-account",
		R2APIKey:    "test-key",
		R2Bucket:    "fellowhire",
	}

	store, err := New(cfg)
	if err != nil {
		t.Fatalf("failed to initialize R2 storage: %v", err)
	}
	if _, ok := store.(*R2Storage); !ok {
		t.Fatalf("expected *R2Storage, got %T", store)
	}
}
