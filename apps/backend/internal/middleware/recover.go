package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/kulkul/backend/internal/httpx"
)

func Recover(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("panic recovered",
						"error", rec,
						"request_id", GetRequestID(r.Context()),
						"stack", string(debug.Stack()),
					)
					httpx.Error(w, http.StatusInternalServerError, "internal server error")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
