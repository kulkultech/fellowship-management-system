package handler_test

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/pkg/storage"
)

func TestUploadHandler_UploadAndServe(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := storage.NewLocalStorage(tmpDir)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := handler.NewUploadHandler(store, logger)

	// Create multipart request
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "company_logo.png")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	sampleImage := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0x00, 0x00}
	_, _ = part.Write(sampleImage)
	_ = writer.WriteField("folder", "logos")
	_ = writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads?folder=logos", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	h.Upload(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	if !strings.Contains(w.Body.String(), `"/uploads/logos/`) {
		t.Fatalf("expected /uploads/logos/ in response, got: %s", w.Body.String())
	}

	// Test serving media
	r := chi.NewRouter()
	r.Get("/uploads/*", h.ServeMedia)

	// Extract the key from local store
	testKey := "logos/test_serve.png"
	_, err = store.Upload(context.Background(), testKey, bytes.NewReader(sampleImage), int64(len(sampleImage)), "image/png")
	if err != nil {
		t.Fatalf("failed to upload test file: %v", err)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/uploads/"+testKey, nil)
	getW := httptest.NewRecorder()
	r.ServeHTTP(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Fatalf("expected status 200 on serve, got %d", getW.Code)
	}
	if getW.Header().Get("Content-Type") != "image/png" {
		t.Errorf("expected image/png content type, got: %s", getW.Header().Get("Content-Type"))
	}
	if !bytes.Equal(getW.Body.Bytes(), sampleImage) {
		t.Errorf("served content mismatch")
	}
}

func TestUploadHandler_RejectInvalidExtension(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := storage.NewLocalStorage(tmpDir)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := handler.NewUploadHandler(store, logger)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "malicious.exe")
	_, _ = part.Write([]byte("malicious executable content"))
	_ = writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	h.Upload(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for .exe file, got %d: %s", w.Code, w.Body.String())
	}
}
