package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// OAuthStateCookie holds the anti-CSRF state value during the OAuth round-trip.
const OAuthStateCookie = "oauth_state"

// GoogleProfile is the subset of the Google userinfo response we consume.
type GoogleProfile struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// GoogleOAuth wraps the oauth2 config for Google sign-in.
type GoogleOAuth struct {
	cfg *oauth2.Config
}

// NewGoogleOAuth builds the Google OAuth client.
func NewGoogleOAuth(clientID, clientSecret, redirectURL string) *GoogleOAuth {
	return &GoogleOAuth{
		cfg: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
	}
}

// NewState returns a random URL-safe state token.
func NewState() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: generate oauth state: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// AuthCodeURL returns the provider URL to redirect the user to.
func (g *GoogleOAuth) AuthCodeURL(state string) string {
	return g.cfg.AuthCodeURL(state, oauth2.AccessTypeOffline)
}

// Exchange swaps an authorization code for the caller's Google profile.
func (g *GoogleOAuth) Exchange(ctx context.Context, code string) (GoogleProfile, error) {
	token, err := g.cfg.Exchange(ctx, code)
	if err != nil {
		return GoogleProfile{}, fmt.Errorf("auth: exchange code: %w", err)
	}

	client := g.cfg.Client(ctx, token)
	resp, err := client.Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return GoogleProfile{}, fmt.Errorf("auth: fetch userinfo: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return GoogleProfile{}, fmt.Errorf("auth: userinfo status %d: %s", resp.StatusCode, string(body))
	}

	var profile GoogleProfile
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		return GoogleProfile{}, fmt.Errorf("auth: decode userinfo: %w", err)
	}
	if profile.Sub == "" || profile.Email == "" {
		return GoogleProfile{}, fmt.Errorf("auth: incomplete google profile")
	}
	return profile, nil
}
