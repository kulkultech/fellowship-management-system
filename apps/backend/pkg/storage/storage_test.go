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
	if url != "/api/v1/uploads/logos/test_logo.png" {
		t.Fatalf("expected /api/v1/uploads/logos/test_logo.png, got %s", url)
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

func TestLocalStorage_PresignUpload(t *testing.T) {
	store, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("failed to create local storage: %v", err)
	}

	_, err = store.PresignUpload(context.Background(), "recordings/test.webm", "video/webm", 0)
	if err != ErrPresignNotSupported {
		t.Fatalf("expected ErrPresignNotSupported, got %v", err)
	}
}

func TestR2Storage_PresignUpload(t *testing.T) {
	// 1. Without S3 credentials -> ErrPresignNotConfigured
	r2NoKeys, err := NewR2Storage("test-account", "test-api-key", "", "", "fellowhire", "", "")
	if err != nil {
		t.Fatalf("failed to create R2 storage: %v", err)
	}
	_, err = r2NoKeys.PresignUpload(context.Background(), "recordings/test.webm", "video/webm", 0)
	if err != ErrPresignNotConfigured {
		t.Fatalf("expected ErrPresignNotConfigured, got %v", err)
	}

	// 2. With S3 credentials -> returns valid presigned PUT URL and 1GB max limit
	r2WithKeys, err := NewR2Storage("ce4e0c8396fedba22f952f83346bfb04", "", "dummy-access-key", "dummy-secret-key", "fellowhire", "https://media.fellowhire.kul.to", "")
	if err != nil {
		t.Fatalf("failed to create R2 storage with S3 credentials: %v", err)
	}

	presign, err := r2WithKeys.PresignUpload(context.Background(), "recordings/interview_123.webm", "video/webm", 0)
	if err != nil {
		t.Fatalf("failed to presign upload: %v", err)
	}

	if presign.Method != "PUT" {
		t.Errorf("expected PUT method, got %s", presign.Method)
	}
	if !strings.Contains(presign.UploadURL, "fellowhire.ce4e0c8396fedba22f952f83346bfb04.r2.cloudflarestorage.com/recordings/interview_123.webm") {
		t.Errorf("unexpected upload URL: %s", presign.UploadURL)
	}
	if !strings.Contains(presign.UploadURL, "X-Amz-Signature=") {
		t.Errorf("expected presigned URL to contain SigV4 signature, got %s", presign.UploadURL)
	}
	if presign.FileURL != "https://media.fellowhire.kul.to/recordings/interview_123.webm" {
		t.Errorf("expected public file URL https://media.fellowhire.kul.to/recordings/interview_123.webm, got %s", presign.FileURL)
	}
	if presign.MaxSizeBytes != 1073741824 {
		t.Errorf("expected max size bytes 1073741824 (1GB), got %d", presign.MaxSizeBytes)
	}
}

func TestLocalStorage_PresignDownload(t *testing.T) {
	store, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("failed to create local storage: %v", err)
	}

	_, err = store.PresignDownload(context.Background(), "recordings/test.webm", 0)
	if err != ErrPresignNotSupported {
		t.Fatalf("expected ErrPresignNotSupported, got %v", err)
	}
}

func TestR2Storage_PresignDownload(t *testing.T) {
	// 1. Without S3 credentials -> ErrPresignNotConfigured
	r2NoKeys, err := NewR2Storage("test-account", "test-api-key", "", "", "fellowhire", "", "")
	if err != nil {
		t.Fatalf("failed to create R2 storage: %v", err)
	}
	_, err = r2NoKeys.PresignDownload(context.Background(), "recordings/test.webm", 0)
	if err != ErrPresignNotConfigured {
		t.Fatalf("expected ErrPresignNotConfigured, got %v", err)
	}

	// 2. With S3 credentials -> returns valid presigned GET URL with SigV4
	r2WithKeys, err := NewR2Storage("ce4e0c8396fedba22f952f83346bfb04", "", "dummy-access-key", "dummy-secret-key", "fellowhire", "https://media.fellowhire.kul.to", "")
	if err != nil {
		t.Fatalf("failed to create R2 storage with S3 credentials: %v", err)
	}

	downloadURL, err := r2WithKeys.PresignDownload(context.Background(), "recordings/interview_123.webm", 0)
	if err != nil {
		t.Fatalf("failed to presign download: %v", err)
	}

	if !strings.Contains(downloadURL, "fellowhire.ce4e0c8396fedba22f952f83346bfb04.r2.cloudflarestorage.com/recordings/interview_123.webm") {
		t.Errorf("unexpected download URL: %s", downloadURL)
	}
	if !strings.Contains(downloadURL, "X-Amz-Signature=") {
		t.Errorf("expected presigned URL to contain SigV4 signature, got %s", downloadURL)
	}
}

