package handler

import (
	"net/http"

	"github.com/kulkul/backend/internal/httpx"
)

func Healthz(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
