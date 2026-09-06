package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type R2Storage struct {
	accountID     string
	apiKey        string
	bucket        string
	publicURL     string
	localFallback *LocalStorage
	httpClient    *http.Client
}

func NewR2Storage(accountID, apiKey, bucket, publicURL, localPath string) (*R2Storage, error) {
	if accountID == "" || apiKey == "" {
		return nil, fmt.Errorf("storage/r2: accountID and apiKey are required")
	}
	if bucket == "" {
		bucket = "fellowhire"
	}

	var local *LocalStorage
	if localPath != "" {
		local, _ = NewLocalStorage(localPath)
	}

	return &R2Storage{
		accountID:     accountID,
		apiKey:        apiKey,
		bucket:        bucket,
		publicURL:     strings.TrimRight(publicURL, "/"),
		localFallback: local,
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // Allow sufficient time for larger video uploads
		},
	}, nil
}

func (s *R2Storage) Upload(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error) {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	var bodyBytes []byte
	buf := &bytes.Buffer{}
	n, err := io.Copy(buf, r)
	if err != nil {
		return "", fmt.Errorf("storage/r2: buffer stream: %w", err)
	}
	bodyBytes = buf.Bytes()
	contentLength := n

	// Mirror to local storage for zero-latency seeking and fast playback
	if s.localFallback != nil {
		_, _ = s.localFallback.Upload(ctx, cleanKey, bytes.NewReader(bodyBytes), contentLength, contentType)
	}

	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/r2/buckets/%s/objects/%s", s.accountID, s.bucket, cleanKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("storage/r2: create put request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", contentType)
	req.ContentLength = contentLength

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("storage/r2: execute put request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("storage/r2: put object failed with status %d: %s", resp.StatusCode, string(respBytes))
	}

	return s.GetURL(cleanKey), nil
}

func (s *R2Storage) Get(ctx context.Context, key string) (io.ReadCloser, string, int64, error) {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")

	// Check local fallback first for instant disk access and native io.ReadSeeker
	if s.localFallback != nil {
		rc, cType, cLen, localErr := s.localFallback.Get(ctx, cleanKey)
		if localErr == nil {
			return rc, cType, cLen, nil
		}
	}

	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/r2/buckets/%s/objects/%s", s.accountID, s.bucket, cleanKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", 0, fmt.Errorf("storage/r2: create get request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", 0, fmt.Errorf("storage/r2: execute get request: %w", err)
	}

	if resp.StatusCode == http.StatusOK {
		contentType := resp.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		// Cache locally if local fallback is enabled
		if s.localFallback != nil {
			data, readErr := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			if readErr == nil {
				_, _ = s.localFallback.Upload(ctx, cleanKey, bytes.NewReader(data), int64(len(data)), contentType)
				return io.NopCloser(bytes.NewReader(data)), contentType, int64(len(data)), nil
			}
		}
		return resp.Body, contentType, resp.ContentLength, nil
	}

	_ = resp.Body.Close()

	return nil, "", 0, fmt.Errorf("storage/r2: object not found (status %d)", resp.StatusCode)
}

func (s *R2Storage) Delete(ctx context.Context, key string) error {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")

	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/r2/buckets/%s/objects/%s", s.accountID, s.bucket, cleanKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("storage/r2: create delete request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("storage/r2: execute delete request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("storage/r2: delete failed with status %d: %s", resp.StatusCode, string(respBytes))
	}

	if s.localFallback != nil {
		_ = s.localFallback.Delete(ctx, cleanKey)
	}

	return nil
}

func (s *R2Storage) GetURL(key string) string {
	cleanKey := strings.TrimPrefix(key, "/")
	cleanKey = strings.TrimPrefix(cleanKey, "uploads/")

	if s.publicURL != "" {
		return s.publicURL + "/" + cleanKey
	}
	return "/uploads/" + cleanKey
}
