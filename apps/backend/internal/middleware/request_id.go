package middleware

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

type contextKey string

const (
	RequestIDHeader            = "X-Request-ID"
	RequestIDKey    contextKey = "request_id"
)

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get(RequestIDHeader)
		if reqID == "" {
			reqID = uuid.New().String()
		}
		ctx := context.WithValue(r.Context(), RequestIDKey, reqID)
		w.Header().Set(RequestIDHeader, reqID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetRequestID(ctx context.Context) string {
	if val, ok := ctx.Value(RequestIDKey).(string); ok {
		return val
	}
	return ""
}
