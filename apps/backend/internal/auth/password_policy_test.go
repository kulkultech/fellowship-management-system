package auth

import "testing"

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"valid strong", "password123", false},
		{"too short", "pass1", true},
		{"no number", "passwordonly", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePassword(tt.password)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidatePassword(%q) error = %v, wantErr %v", tt.password, err, tt.wantErr)
			}
		})
	}
}

func TestHashAndCheckPassword(t *testing.T) {
	pass := "secretPassword123"
	hash, err := HashPassword(pass)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if !CheckPassword(hash, pass) {
		t.Errorf("CheckPassword returned false for correct password")
	}

	if CheckPassword(hash, "wrongPassword") {
		t.Errorf("CheckPassword returned true for wrong password")
	}
}
