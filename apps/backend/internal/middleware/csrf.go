package middleware

import (
	"crypto/subtle"
	"net/http"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/httpx"
)

var safeMethods = map[string]bool{
	http.MethodGet:     true,
	http.MethodHead:    true,
	http.MethodOptions: true,
	http.MethodTrace:   true,
}

func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if safeMethods[r.Method] {
			next.ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie(auth.CSRFCookieName)
		if err != nil || cookie.Value == "" {
			httpx.Error(w, http.StatusForbidden, "missing csrf cookie")
			return
		}

		headerVal := r.Header.Get("X-CSRF-Token")
		if headerVal == "" {
			httpx.Error(w, http.StatusForbidden, "missing csrf header")
			return
		}

		if subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(headerVal)) != 1 {
			httpx.Error(w, http.StatusForbidden, "invalid csrf token")
			return
		}

		next.ServeHTTP(w, r)
	})
}
