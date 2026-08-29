package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type LocalStorage struct {
	basePath string
}

func NewLocalStorage(basePath string) (*LocalStorage, error) {
	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, fmt.Errorf("storage/local: create base path: %w", err)
	}
	return &LocalStorage{basePath: basePath}, nil
}

func (s *LocalStorage) Upload(_ context.Context, key string, r io.Reader, _ string) (string, error) {
	dest := filepath.Join(s.basePath, filepath.Clean("/"+key))
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", fmt.Errorf("storage/local: mkdir: %w", err)
	}

	f, err := os.Create(dest)
	if err != nil {
		return "", fmt.Errorf("storage/local: create file: %w", err)
	}

	if _, err := io.Copy(f, r); err != nil {
		_ = f.Close()
		return "", fmt.Errorf("storage/local: write file: %w", err)
	}
	if err := f.Close(); err != nil {
		return "", fmt.Errorf("storage/local: close file: %w", err)
	}
	return dest, nil
}

func (s *LocalStorage) Delete(_ context.Context, key string) error {
	dest := filepath.Join(s.basePath, filepath.Clean("/"+key))
	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("storage/local: delete file: %w", err)
	}
	return nil
}
