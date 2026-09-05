package storage

import (
	"context"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
)

type LocalStorage struct {
	basePath string
}

func NewLocalStorage(basePath string) (*LocalStorage, error) {
	if basePath == "" {
		basePath = "./uploads"
	}
	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, fmt.Errorf("storage/local: create base path: %w", err)
	}
	return &LocalStorage{basePath: basePath}, nil
}

func (s *LocalStorage) Upload(_ context.Context, key string, r io.Reader, _ int64, _ string) (string, error) {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")

	dest := filepath.Join(s.basePath, filepath.Clean("/"+cleanKey))
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
	return s.GetURL(cleanKey), nil
}

func (s *LocalStorage) Get(_ context.Context, key string) (io.ReadCloser, string, int64, error) {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")

	dest := filepath.Join(s.basePath, filepath.Clean("/"+cleanKey))
	stat, err := os.Stat(dest)
	if err != nil {
		return nil, "", 0, fmt.Errorf("storage/local: stat file: %w", err)
	}

	f, err := os.Open(dest)
	if err != nil {
		return nil, "", 0, fmt.Errorf("storage/local: open file: %w", err)
	}

	cType := mime.TypeByExtension(filepath.Ext(dest))
	if cType == "" {
		cType = "application/octet-stream"
	}

	return f, cType, stat.Size(), nil
}

func (s *LocalStorage) Delete(_ context.Context, key string) error {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")

	dest := filepath.Join(s.basePath, filepath.Clean("/"+cleanKey))
	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("storage/local: delete file: %w", err)
	}
	return nil
}

func (s *LocalStorage) GetURL(key string) string {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")
	return "/uploads/" + cleanKey
}
