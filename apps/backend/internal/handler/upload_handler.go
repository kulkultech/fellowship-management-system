package handler

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/pkg/storage"
)

type UploadHandler struct {
	storage storage.Storage
	logger  *slog.Logger
}

func NewUploadHandler(store storage.Storage, logger *slog.Logger) *UploadHandler {
	return &UploadHandler{
		storage: store,
		logger:  logger,
	}
}

type UploadResponse struct {
	URL         string `json:"url"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
	Filename    string `json:"filename"`
}

var allowedMimePrefixes = []string{
	"image/",
	"video/",
	"application/pdf",
}

var allowedExtensions = map[string]bool{
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".webp": true,
	".svg":  true,
	".gif":  true,
	".pdf":  true,
	".webm": true,
	".mp4":  true,
	".mov":  true,
	".ogg":  true,
}

func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	// 100MB max limit to allow full video recordings as well as images
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		httpx.Error(w, http.StatusBadRequest, "failed to parse multipart form or payload too large")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		// Fallback check for alternate form keys
		file, header, err = r.FormFile("image")
		if err != nil {
			file, header, err = r.FormFile("video")
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "missing file in form field (use 'file', 'image', or 'video')")
				return
			}
		}
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExtensions[ext] {
		httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("unsupported file extension: %s", ext))
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" || contentType == "application/octet-stream" {
		switch ext {
		case ".png":
			contentType = "image/png"
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".webp":
			contentType = "image/webp"
		case ".svg":
			contentType = "image/svg+xml"
		case ".gif":
			contentType = "image/gif"
		case ".pdf":
			contentType = "application/pdf"
		case ".webm":
			contentType = "video/webm"
		case ".mp4":
			contentType = "video/mp4"
		case ".mov":
			contentType = "video/quicktime"
		case ".ogg":
			contentType = "video/ogg"
		default:
			contentType = "application/octet-stream"
		}
	}

	validMime := false
	for _, prefix := range allowedMimePrefixes {
		if strings.HasPrefix(contentType, prefix) {
			validMime = true
			break
		}
	}
	if !validMime && ext != ".pdf" {
		httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("unsupported media type: %s", contentType))
		return
	}

	folder := strings.TrimSpace(r.URL.Query().Get("folder"))
	if folder == "" {
		folder = strings.TrimSpace(r.FormValue("folder"))
	}
	if folder == "" {
		switch {
		case strings.HasPrefix(contentType, "image/"):
			folder = "images"
		case strings.HasPrefix(contentType, "video/"):
			folder = "recordings"
		case ext == ".pdf":
			folder = "documents"
		default:
			folder = "general"
		}
	}
	// Sanitize folder
	folder = strings.ToLower(strings.Trim(folder, "/."))
	if folder == "" {
		folder = "general"
	}

	cleanBase := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, strings.TrimSuffix(header.Filename, ext))
	if len(cleanBase) > 32 {
		cleanBase = cleanBase[:32]
	}

	uniqueFilename := fmt.Sprintf("%s_%s%s", cleanBase, uuid.New().String()[:8], ext)
	objectKey := fmt.Sprintf("%s/%s", folder, uniqueFilename)

	mediaURL, err := h.storage.Upload(r.Context(), objectKey, file, header.Size, contentType)
	if err != nil {
		h.logger.Error("storage upload error", slog.Any("error", err), slog.String("key", objectKey))
		httpx.Error(w, http.StatusInternalServerError, "failed to upload media asset to storage")
		return
	}

	httpx.JSON(w, http.StatusOK, UploadResponse{
		URL:         mediaURL,
		Key:         objectKey,
		Size:        header.Size,
		ContentType: contentType,
		Filename:    uniqueFilename,
	})
}

func (h *UploadHandler) ServeMedia(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "*")
	if key == "" {
		httpx.Error(w, http.StatusNotFound, "media key not specified")
		return
	}

	rc, contentType, size, err := h.storage.Get(r.Context(), key)
	if err != nil {
		h.logger.Warn("media not found", slog.String("key", key), slog.Any("error", err))
		httpx.Error(w, http.StatusNotFound, "media file not found")
		return
	}
	defer rc.Close()

	if contentType == "" || contentType == "application/octet-stream" {
		ext := strings.ToLower(filepath.Ext(key))
		switch ext {
		case ".webm":
			contentType = "video/webm"
		case ".mp4":
			contentType = "video/mp4"
		case ".mov":
			contentType = "video/quicktime"
		case ".png":
			contentType = "image/png"
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".webp":
			contentType = "image/webp"
		case ".svg":
			contentType = "image/svg+xml"
		case ".pdf":
			contentType = "application/pdf"
		}
	}

	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	if size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Accept-Ranges", "bytes")

	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, rc); err != nil {
		h.logger.Debug("streaming media ended", slog.Any("error", err))
	}
}
