package auth

import (
	"errors"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrPasswordTooShort = errors.New("password must be at least 8 characters long")
	ErrPasswordNoNumber = errors.New("password must contain at least one number")
)

func ValidatePassword(password string) error {
	if len(password) < 8 {
		return ErrPasswordTooShort
	}
	hasNumber := false
	for _, ch := range password {
		if unicode.IsDigit(ch) {
			hasNumber = true
			break
		}
	}
	if !hasNumber {
		return ErrPasswordNoNumber
	}
	return nil
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
