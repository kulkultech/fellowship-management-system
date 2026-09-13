package storage

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/kulkul/backend/internal/config"
)

var (
	ErrPresignNotConfigured = errors.New("storage: presigned upload is not configured (missing S3 credentials)")
	ErrPresignNotSupported  = errors.New("storage: presigned upload is not supported by this storage provider")
)

type PresignedUpload struct {
	UploadURL    string            `json:"upload_url"`
	Method       string            `json:"method"`
	Headers      map[string]string `json:"headers,omitempty"`
	FileURL      string            `json:"file_url"`
	Key          string            `json:"key"`
	MaxSizeBytes int64             `json:"max_size_bytes"`
}

type Storage interface {
	Upload(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error)
	Get(ctx context.Context, key string) (io.ReadCloser, string, int64, error)
	Delete(ctx context.Context, key string) error
	GetURL(key string) string
	PresignUpload(ctx context.Context, key string, contentType string, expiresIn time.Duration) (*PresignedUpload, error)
}

func New(cfg config.StorageConfig) (Storage, error) {
	// If R2 credentials are present, use Cloudflare R2
	if (cfg.Provider == "r2" || cfg.Provider == "cloudflare" || cfg.Provider == "") && cfg.R2AccountID != "" && (cfg.R2APIKey != "" || cfg.R2AccessKeyID != "") {
		bucket := cfg.R2Bucket
		if bucket == "" {
			bucket = "fellowhire"
		}
		return NewR2Storage(cfg.R2AccountID, cfg.R2APIKey, cfg.R2AccessKeyID, cfg.R2SecretAccessKey, bucket, cfg.R2PublicURL, cfg.LocalPath)
	}

	return NewLocalStorage(cfg.LocalPath)
}
