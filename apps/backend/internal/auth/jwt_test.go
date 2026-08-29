package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestJWTGenerateAndValidate(t *testing.T) {
	secret := "super-secret-key-32-characters-long!!"
	svc := NewService(secret, 1*time.Hour)

	userID := uuid.New()
	orgID := uuid.New()
	email := "test@example.com"
	role := "reviewer"

	token, err := svc.GenerateToken(userID, &orgID, email, role)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	claims, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("got UserID %v, want %v", claims.UserID, userID)
	}
	if claims.Email != email {
		t.Errorf("got Email %v, want %v", claims.Email, email)
	}
	if claims.Role != role {
		t.Errorf("got Role %v, want %v", claims.Role, role)
	}
}
