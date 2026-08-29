package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/kulkul/backend/internal/httpx"
)

func StaticToken(expectedToken string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			token := strings.TrimPrefix(authHeader, "Bearer ")

			if subtle.ConstantTimeCompare([]byte(token), []byte(expectedToken)) != 1 {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
