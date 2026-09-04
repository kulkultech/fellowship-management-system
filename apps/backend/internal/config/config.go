package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv             string
	HTTPPort           string
	DatabaseURL        string
	JWTSecret          string
	JWTTTL             time.Duration
	CORSAllowedOrigins []string
	MetricsToken       string
	CookieSecure       bool
	CookieDomain       string
	GoogleOAuth        OAuthConfig
	Storage            StorageConfig
	Cloudflare         CloudflareConfig
}

type CloudflareConfig struct {
	AccountID string
	APIKey    string
	APIToken  string
}

func (c CloudflareConfig) Enabled() bool {
	return c.AccountID != "" && (c.APIToken != "" || c.APIKey != "")
}

func (c CloudflareConfig) Token() string {
	if c.APIToken != "" {
		return c.APIToken
	}
	return c.APIKey
}


type OAuthConfig struct {
	ClientID           string
	ClientSecret       string
	RedirectURL        string
	FrontendSuccessURL string
}

func (o OAuthConfig) Enabled() bool {
	return o.ClientID != "" && o.ClientSecret != "" && o.RedirectURL != ""
}

type StorageConfig struct {
	Provider       string
	LocalPath      string
	S3Endpoint     string
	S3Region       string
	S3Bucket       string
	S3AccessKeyID  string
	S3SecretKey    string
	S3UsePathStyle bool
}

func Load() (*Config, error) {
	if os.Getenv("APP_ENV") != "production" {
		_ = godotenv.Load()
	}

	ttlMinutes, err := getInt("JWT_TTL_MINUTES", 1440)
	if err != nil {
		return nil, err
	}

	frontendURL := strings.TrimRight(getString("FRONTEND_URL", ""), "/")
	defaultSuccessURL := "http://localhost:5173/admin/dashboard"
	if frontendURL != "" {
		defaultSuccessURL = frontendURL + "/admin/dashboard"
	}

	defaultRedirectURL := ""
	if frontendURL != "" {
		defaultRedirectURL = frontendURL + "/api/v1/auth/oauth/google/callback"
	}

	corsOrigins := getCSV("CORS_ALLOWED_ORIGINS")
	if len(corsOrigins) == 0 && frontendURL != "" {
		corsOrigins = []string{frontendURL}
	}

	cfg := &Config{
		AppEnv:             getString("APP_ENV", "development"),
		HTTPPort:           getString("HTTP_PORT", "8080"),
		DatabaseURL:        getString("DATABASE_URL", ""),
		JWTSecret:          getString("JWT_SECRET", "development-jwt-secret-key-32characters-long!!"),
		JWTTTL:             time.Duration(ttlMinutes) * time.Minute,
		CORSAllowedOrigins: corsOrigins,
		MetricsToken:       getString("METRICS_TOKEN", ""),
		CookieSecure:       getBool("COOKIE_SECURE", false),
		CookieDomain:       getString("COOKIE_DOMAIN", ""),
		GoogleOAuth: OAuthConfig{
			ClientID:           getString("GOOGLE_CLIENT_ID", ""),
			ClientSecret:       getString("GOOGLE_CLIENT_SECRET", ""),
			RedirectURL:        getString("GOOGLE_REDIRECT_URL", defaultRedirectURL),
			FrontendSuccessURL: getString("OAUTH_FRONTEND_SUCCESS_URL", defaultSuccessURL),
		},
		Storage: StorageConfig{
			Provider:       getString("STORAGE_PROVIDER", "local"),
			LocalPath:      getString("LOCAL_STORAGE_PATH", "./uploads"),
			S3Endpoint:     getString("S3_ENDPOINT", ""),
			S3Region:       getString("S3_REGION", "us-east-1"),
			S3Bucket:       getString("S3_BUCKET", ""),
			S3AccessKeyID:  getString("S3_ACCESS_KEY_ID", ""),
			S3SecretKey:    getString("S3_SECRET_ACCESS_KEY", ""),
			S3UsePathStyle: getBool("S3_USE_PATH_STYLE", true),
		},
		Cloudflare: CloudflareConfig{
			AccountID: getString("CLOUDFLARE_ACCOUNT_ID", ""),
			APIKey:    getString("CLOUDFLARE_API_KEY", ""),
			APIToken:  getString("CLOUDFLARE_API_TOKEN", getString("CLOUDFLARE_API_KEY", "")),
		},
	}

	if cfg.AppEnv == "production" {
		cfg.CookieSecure = true
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

const minProdSecretLen = 32

var weakSecrets = map[string]struct{}{
	"change-me-in-production-please": {},
	"secret":                         {},
	"changeme":                       {},
}

func (c *Config) validate() error {
	if c.DatabaseURL == "" && c.AppEnv == "production" {
		return fmt.Errorf("config: DATABASE_URL is required in production")
	}
	if c.JWTSecret == "" {
		return fmt.Errorf("config: JWT_SECRET is required")
	}
	if c.AppEnv == "production" {
		if _, weak := weakSecrets[c.JWTSecret]; weak {
			return fmt.Errorf("config: JWT_SECRET is a known placeholder; set a strong secret in production")
		}
		if len(c.JWTSecret) < minProdSecretLen {
			return fmt.Errorf("config: JWT_SECRET must be at least %d characters in production", minProdSecretLen)
		}
	}
	return nil
}

func getString(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getCSV(key string) []string {
	v := os.Getenv(key)
	if v == "" {
		return []string{"http://localhost:5173", "http://localhost:3000"}
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func getInt(key string, fallback int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("config: %s must be an integer: %w", key, err)
	}
	return n, nil
}

func getBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
