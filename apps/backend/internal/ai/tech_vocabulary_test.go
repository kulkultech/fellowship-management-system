package ai

import (
	"testing"
)

func TestNormalizeTechVocabulary(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{
			input:    "I built a project with go lang and post grease database",
			expected: "I built a project with Golang and PostgreSQL database",
		},
		{
			input:    "We deployed on cube nettees using dock are containers",
			expected: "We deployed on Kubernetes using Docker containers",
		},
		{
			input:    "The backend is type script and node js with rest api and graph ql",
			expected: "The backend is TypeScript and Node.js with REST API and GraphQL",
		},
		{
			input:    "We cached session data in radish store and used j w t for auth",
			expected: "We cached session data in Redis store and used JWT for auth",
		},
		{
			input:    "The service runs on a w s with c i c d pipeline",
			expected: "The service runs on AWS with CI/CD pipeline",
		},
	}

	for _, tt := range tests {
		got := NormalizeTechVocabulary(tt.input)
		if got != tt.expected {
			t.Errorf("NormalizeTechVocabulary(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}
