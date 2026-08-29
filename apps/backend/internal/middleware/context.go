package middleware

import (
	"context"

	"github.com/kulkul/backend/internal/auth"
)

type userContextKey string

const (
	UserKey userContextKey = "auth_user"
)

func WithUser(ctx context.Context, claims *auth.Claims) context.Context {
	return context.WithValue(ctx, UserKey, claims)
}

func GetUser(ctx context.Context) (*auth.Claims, bool) {
	claims, ok := ctx.Value(UserKey).(*auth.Claims)
	return claims, ok
}
