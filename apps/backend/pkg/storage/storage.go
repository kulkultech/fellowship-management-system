package storage

import (
	"context"
	"io"

	"github.com/kulkul/backend/internal/config"
)

type Storage interface {
	Upload(ctx context.Context, key string, r io.Reader, contentType string) (string, error)
	Delete(ctx context.Context, key string) error
}

func New(cfg config.StorageConfig) (Storage, error) {
	switch cfg.Provider {
	case "local":
		return NewLocalStorage(cfg.LocalPath)
	default:
		return NewLocalStorage(cfg.LocalPath)
	}
}
