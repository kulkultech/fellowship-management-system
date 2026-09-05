package storage

import (
	"context"
	"io"

	"github.com/kulkul/backend/internal/config"
)

type Storage interface {
	Upload(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error)
	Get(ctx context.Context, key string) (io.ReadCloser, string, int64, error)
	Delete(ctx context.Context, key string) error
	GetURL(key string) string
}

func New(cfg config.StorageConfig) (Storage, error) {
	// If R2 credentials are present, use Cloudflare R2
	if (cfg.Provider == "r2" || cfg.Provider == "cloudflare" || cfg.Provider == "") && cfg.R2AccountID != "" && cfg.R2APIKey != "" {
		bucket := cfg.R2Bucket
		if bucket == "" {
			bucket = "fellowhire"
		}
		return NewR2Storage(cfg.R2AccountID, cfg.R2APIKey, bucket, cfg.R2PublicURL, cfg.LocalPath)
	}

	return NewLocalStorage(cfg.LocalPath)
}
