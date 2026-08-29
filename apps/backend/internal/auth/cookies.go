package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"
)

const (
	AuthCookieName = "access_token"
	CSRFCookieName = "csrf_token"
)

type CookieOptions struct {
	Secure bool
	Domain string
	MaxAge time.Duration
}

func GenerateCSRFToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func SetAuthCookies(w http.ResponseWriter, token, csrfToken string, opts CookieOptions) {
	maxAge := int(opts.MaxAge.Seconds())

	http.SetCookie(w, &http.Cookie{
		Name:     AuthCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   opts.Secure,
		Domain:   opts.Domain,
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    csrfToken,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: false,
		Secure:   opts.Secure,
		Domain:   opts.Domain,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearAuthCookies(w http.ResponseWriter, opts CookieOptions) {
	http.SetCookie(w, &http.Cookie{
		Name:     AuthCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   opts.Secure,
		Domain:   opts.Domain,
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   opts.Secure,
		Domain:   opts.Domain,
		SameSite: http.SameSiteLaxMode,
	})
}
