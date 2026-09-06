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

// RequireRole verifies that the authenticated user possesses one of the allowed roles.
// Users with role "superadmin" automatically bypass role restrictions.
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := GetUser(r.Context())
			if !ok || claims == nil {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized: session missing")
				return
			}

			// superadmin has full access across all administrative routes
			if claims.Role == "superadmin" {
				next.ServeHTTP(w, r)
				return
			}

			for _, role := range allowedRoles {
				if claims.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}

			httpx.Error(w, http.StatusForbidden, "forbidden: candidate and unauthorized accounts cannot access admin resources")
		})
	}
}
