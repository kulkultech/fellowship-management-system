package middleware

import (
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/getsentry/sentry-go"
	"github.com/kulkul/backend/internal/httpx"
)

func Recover(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					reqID := GetRequestID(r.Context())
					logger.Error("panic recovered",
						"error", rec,
						"request_id", reqID,
						"stack", string(debug.Stack()),
					)

					hub := sentry.GetHubFromContext(r.Context())
					if hub == nil {
						hub = sentry.CurrentHub()
					}
					if hub != nil {
						hub.WithScope(func(scope *sentry.Scope) {
							if reqID != "" {
								scope.SetTag("request_id", reqID)
							}
							scope.SetRequest(r)
							if err, ok := rec.(error); ok {
								hub.CaptureException(err)
							} else {
								hub.CaptureMessage(fmt.Sprintf("panic: %v", rec))
							}
						})
					}

					httpx.Error(w, http.StatusInternalServerError, "internal server error")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
