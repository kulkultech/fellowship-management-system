package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/middleware"
)

func TestRequireRole(t *testing.T) {
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	tests := []struct {
		name         string
		userClaims   *auth.Claims
		allowedRoles []string
		expectedCode int
	}{
		{
			name:         "no claims in context",
			userClaims:   nil,
			allowedRoles: []string{"org_admin"},
			expectedCode: http.StatusUnauthorized,
		},
		{
			name: "candidate blocked from admin route",
			userClaims: &auth.Claims{
				UserID: uuid.New(),
				Email:  "candidate@example.com",
				Role:   "candidate",
			},
			allowedRoles: []string{"org_admin", "reviewer"},
			expectedCode: http.StatusForbidden,
		},
		{
			name: "org_admin allowed on admin route",
			userClaims: &auth.Claims{
				UserID: uuid.New(),
				Email:  "admin@rsa.org",
				Role:   "org_admin",
			},
			allowedRoles: []string{"org_admin", "reviewer"},
			expectedCode: http.StatusOK,
		},
		{
			name: "org_admin blocked from superadmin route",
			userClaims: &auth.Claims{
				UserID: uuid.New(),
				Email:  "admin@rsa.org",
				Role:   "org_admin",
			},
			allowedRoles: []string{"superadmin"},
			expectedCode: http.StatusForbidden,
		},
		{
			name: "superadmin automatically allowed everywhere",
			userClaims: &auth.Claims{
				UserID: uuid.New(),
				Email:  "superadmin@fellowhire.com",
				Role:   "superadmin",
			},
			allowedRoles: []string{"org_admin"},
			expectedCode: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			handler := middleware.RequireRole(tc.allowedRoles...)(dummyHandler)

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tc.userClaims != nil {
				ctx := middleware.WithUser(req.Context(), tc.userClaims)
				req = req.WithContext(ctx)
			}

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != tc.expectedCode {
				t.Fatalf("expected HTTP %d, got %d", tc.expectedCode, rec.Code)
			}
		})
	}
}
