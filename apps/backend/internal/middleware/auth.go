package middleware

import (
	"net/http"
	"strings"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
)

func Authenticator(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := ""

			// 1. Check HttpOnly cookie
			if cookie, err := r.Cookie(auth.AuthCookieName); err == nil && cookie.Value != "" {
				token = cookie.Value
			}

			// 2. Check Authorization header fallback
			if token == "" {
				authHeader := r.Header.Get("Authorization")
				if strings.HasPrefix(authHeader, "Bearer ") {
					token = strings.TrimPrefix(authHeader, "Bearer ")
				}
			}

			if token == "" {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			claims, err := authSvc.ValidateToken(token)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}

			ctx := WithUser(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
