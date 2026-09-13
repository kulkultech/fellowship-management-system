package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/ai"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/pkg/storage"
)

func TestAIInterviewHandler_PresignRecordingUpload_FallbackAndDirect(t *testing.T) {
	aiRepo := repository.NewAIInterviewRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	localStorage, _ := storage.NewLocalStorage(t.TempDir())

	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())
	hLocal := handler.NewAIInterviewHandler(aiRepo, appRepo, progRepo, trackRepo, evaluator, localStorage)

	// 1. Test fallback when using local storage
	reqBody := handler.PresignRecordingUploadRequest{
		ContentType: "video/webm",
		Size:        50 * 1024 * 1024, // 50MB
	}
	bodyBytes, _ := json.Marshal(reqBody)

	r := httptest.NewRequest(http.MethodPost, "/interviews/demo/presign-recording", bytes.NewReader(bodyBytes))
	r.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("inviteToken", "demo")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()
	hLocal.PresignRecordingUpload(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200, got %d: %s", w.Code, w.Body.String())
	}

	var fallbackResp handler.PresignRecordingUploadResponse
	if err := json.NewDecoder(w.Body).Decode(&fallbackResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !fallbackResp.Fallback {
		t.Errorf("expected fallback=true with local storage, got false")
	}
	if fallbackResp.Method != "POST" {
		t.Errorf("expected method=POST for fallback, got %s", fallbackResp.Method)
	}
	if fallbackResp.MaxSizeBytes != 1073741824 {
		t.Errorf("expected max_size_bytes=1073741824 (1GB), got %d", fallbackResp.MaxSizeBytes)
	}
	if !strings.Contains(fallbackResp.UploadURL, "/recording") {
		t.Errorf("expected upload_url to point to /recording, got %s", fallbackResp.UploadURL)
	}

	// 2. Test rejection when size > 1GB
	oversizedBody := handler.PresignRecordingUploadRequest{
		ContentType: "video/webm",
		Size:        1073741824 + 1024, // 1GB + 1KB
	}
	overBytes, _ := json.Marshal(oversizedBody)
	rOver := httptest.NewRequest(http.MethodPost, "/interviews/demo/presign-recording", bytes.NewReader(overBytes))
	rOver.Header.Set("Content-Type", "application/json")
	rctxOver := chi.NewRouteContext()
	rctxOver.URLParams.Add("inviteToken", "demo")
	rOver = rOver.WithContext(context.WithValue(rOver.Context(), chi.RouteCtxKey, rctxOver))

	wOver := httptest.NewRecorder()
	hLocal.PresignRecordingUpload(wOver, rOver)

	if wOver.Code != http.StatusBadRequest {
		t.Fatalf("expected HTTP 400 for oversized video, got %d: %s", wOver.Code, wOver.Body.String())
	}
	if !strings.Contains(wOver.Body.String(), "1GB") {
		t.Errorf("expected error message mentioning 1GB limit, got %s", wOver.Body.String())
	}

	// 3. Test R2 storage with S3 credentials (direct presigned upload)
	r2Store, err := storage.NewR2Storage("ce4e0c8396fedba22f952f83346bfb04", "", "test-access-key", "test-secret-key", "fellowhire", "https://media.fellowhire.kul.to", "")
	if err != nil {
		t.Fatalf("failed to create R2 storage: %v", err)
	}

	hR2 := handler.NewAIInterviewHandler(aiRepo, appRepo, progRepo, trackRepo, evaluator, r2Store)

	rR2 := httptest.NewRequest(http.MethodPost, "/interviews/demo/presign-recording", bytes.NewReader(bodyBytes))
	rR2.Header.Set("Content-Type", "application/json")
	rctxR2 := chi.NewRouteContext()
	rctxR2.URLParams.Add("inviteToken", "demo")
	rR2 = rR2.WithContext(context.WithValue(rR2.Context(), chi.RouteCtxKey, rctxR2))

	wR2 := httptest.NewRecorder()
	hR2.PresignRecordingUpload(wR2, rR2)

	if wR2.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 for R2 presign, got %d: %s", wR2.Code, wR2.Body.String())
	}

	var r2Resp handler.PresignRecordingUploadResponse
	if err := json.NewDecoder(wR2.Body).Decode(&r2Resp); err != nil {
		t.Fatalf("failed to decode R2 response: %v", err)
	}

	if r2Resp.Fallback {
		t.Errorf("expected fallback=false for R2 with credentials, got true")
	}
	if r2Resp.Method != "PUT" {
		t.Errorf("expected method=PUT for R2 direct upload, got %s", r2Resp.Method)
	}
	if !strings.Contains(r2Resp.UploadURL, "fellowhire.ce4e0c8396fedba22f952f83346bfb04.r2.cloudflarestorage.com/recordings/") {
		t.Errorf("unexpected upload_url: %s", r2Resp.UploadURL)
	}
	if !strings.Contains(r2Resp.UploadURL, "X-Amz-Signature=") {
		t.Errorf("expected presigned upload_url to include SigV4 signature")
	}
	if r2Resp.MaxSizeBytes != 1073741824 {
		t.Errorf("expected max_size_bytes=1073741824 (1GB), got %d", r2Resp.MaxSizeBytes)
	}
}

func TestAIInterviewHandler_UploadRecording_DirectR2Confirmation(t *testing.T) {
	aiRepo := repository.NewAIInterviewRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	trackRepo := repository.NewTrackRepository(nil)
	localStorage, _ := storage.NewLocalStorage(t.TempDir())

	evaluator := ai.NewCloudflareEvaluator(config.CloudflareConfig{}, slog.Default())
	h := handler.NewAIInterviewHandler(aiRepo, appRepo, progRepo, trackRepo, evaluator, localStorage)

	// Simulate frontend confirming direct upload to R2
	r2FileURL := "https://media.fellowhire.kul.to/recordings/demo_session_recording.webm"
	confirmBody := map[string]string{
		"recording_url": r2FileURL,
	}
	confirmBytes, _ := json.Marshal(confirmBody)

	r := httptest.NewRequest(http.MethodPost, "/interviews/demo/recording", bytes.NewReader(confirmBytes))
	r.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("inviteToken", "demo")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()
	h.UploadRecording(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200, got %d: %s", w.Code, w.Body.String())
	}

	var uploadResp handler.UploadRecordingResponse
	if err := json.NewDecoder(w.Body).Decode(&uploadResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if uploadResp.RecordingURL != r2FileURL {
		t.Errorf("expected recording_url=%s, got %s", r2FileURL, uploadResp.RecordingURL)
	}
	if uploadResp.RecordingStatus != "ready" {
		t.Errorf("expected recording_status=ready, got %s", uploadResp.RecordingStatus)
	}
	_ = uuid.Nil
}
