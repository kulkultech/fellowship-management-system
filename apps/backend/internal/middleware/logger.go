package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

type responseWriterInterceptor struct {
	http.ResponseWriter
	statusCode int
	bytesWritten int
}

func (w *responseWriterInterceptor) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *responseWriterInterceptor) Write(b []byte) (int, error) {
	if w.statusCode == 0 {
		w.statusCode = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytesWritten += n
	return n, err
}

func Logger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			interceptor := &responseWriterInterceptor{ResponseWriter: w}

			next.ServeHTTP(interceptor, r)

			duration := time.Since(start)
			logger.Info("http request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", interceptor.statusCode,
				"duration_ms", duration.Milliseconds(),
				"bytes", interceptor.bytesWritten,
				"request_id", GetRequestID(r.Context()),
			)
		})
	}
}
