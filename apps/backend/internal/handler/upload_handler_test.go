package handler_test

import (
	"bytes"
	"context"
	"fmt"
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

	if !strings.Contains(w.Body.String(), `"/api/v1/uploads/logos/`) {
		t.Fatalf("expected /api/v1/uploads/logos/ in response, got: %s", w.Body.String())
	}

	// Test serving media on both /api/v1/uploads and /uploads
	r := chi.NewRouter()
	r.Get("/uploads/*", h.ServeMedia)
	r.Get("/api/v1/uploads/*", h.ServeMedia)

	// Extract the key from local store
	testKey := "logos/test_serve.png"
	_, err = store.Upload(context.Background(), testKey, bytes.NewReader(sampleImage), int64(len(sampleImage)), "image/png")
	if err != nil {
		t.Fatalf("failed to upload test file: %v", err)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/"+testKey, nil)
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

	// Test HTTP 206 Range request (crucial for video streaming & seeking)
	rangeReq := httptest.NewRequest(http.MethodGet, "/uploads/"+testKey, nil)
	rangeReq.Header.Set("Range", "bytes=0-3")
	rangeW := httptest.NewRecorder()
	r.ServeHTTP(rangeW, rangeReq)

	if rangeW.Code != http.StatusPartialContent {
		t.Fatalf("expected status 206 Partial Content, got %d", rangeW.Code)
	}
	if rangeW.Header().Get("Accept-Ranges") != "bytes" {
		t.Errorf("expected Accept-Ranges: bytes, got: %s", rangeW.Header().Get("Accept-Ranges"))
	}
	if rangeW.Header().Get("Content-Range") != fmt.Sprintf("bytes 0-3/%d", len(sampleImage)) {
		t.Errorf("unexpected Content-Range header: %s", rangeW.Header().Get("Content-Range"))
	}
	if !bytes.Equal(rangeW.Body.Bytes(), sampleImage[0:4]) {
		t.Errorf("expected first 4 bytes, got %v", rangeW.Body.Bytes())
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
