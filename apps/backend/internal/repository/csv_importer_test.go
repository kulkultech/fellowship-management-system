package repository_test

import (
	"os"
	"strings"
	"testing"

	"github.com/kulkul/backend/internal/repository"
)

func TestParseQuestionsFromCSV_LITAssessment(t *testing.T) {
	// Read the actual General Fullstack & QA LIT Assessment 2026.csv from root
	content, err := os.ReadFile("../../../../General Fullstack & QA LIT Assessment 2026.csv")
	if err != nil {
		t.Skipf("CSV file not found at root path, skipping real file test: %v", err)
		return
	}

	result, err := repository.ParseQuestionsFromCSV(strings.NewReader(string(content)), "Fullstack & QA")
	if err != nil {
		t.Fatalf("unexpected error parsing CSV: %v", err)
	}

	if result.TotalRows != 40 {
		t.Errorf("expected 40 total rows, got %d", result.TotalRows)
	}
	if result.ValidRows != 40 {
		t.Errorf("expected 40 valid rows, got %d (errors: %v)", result.ValidRows, result.Errors)
	}
	if len(result.Questions) != 40 {
		t.Fatalf("expected 40 questions, got %d", len(result.Questions))
	}

	// Verify question 1
	q1 := result.Questions[0]
	if !strings.Contains(q1.QuestionText, "typeof NaN") {
		t.Errorf("expected question 1 to contain 'typeof NaN', got: %s", q1.QuestionText)
	}
	if q1.CorrectOptionID != "a" {
		t.Errorf("expected question 1 answer 'a', got: %s", q1.CorrectOptionID)
	}

	// Verify question 6 (inline code snippet with semicolons)
	q6 := result.Questions[5]
	if !strings.Contains(q6.QuestionText, "Promise.reject('fail')") {
		t.Errorf("expected question 6 to preserve code snippet, got: %s", q6.QuestionText)
	}
	if q6.CorrectOptionID != "d" {
		t.Errorf("expected question 6 answer 'd', got: %s", q6.CorrectOptionID)
	}
}

func TestParseQuestionsFromCSV_CommaDelimited(t *testing.T) {
	csvData := `Question,Choice A,Choice B,Choice C,Choice D,Correct Answer
What is 2+2?,3,4,5,6,B
What is the capital of France?,Berlin,Madrid,Paris,Rome,C
`
	result, err := repository.ParseQuestionsFromCSV(strings.NewReader(csvData), "Math & Geography")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.ValidRows != 2 {
		t.Errorf("expected 2 valid rows, got %d", result.ValidRows)
	}
	if len(result.Questions) != 2 {
		t.Fatalf("expected 2 questions, got %d", len(result.Questions))
	}
	if result.Questions[0].CorrectOptionID != "b" {
		t.Errorf("expected answer 'b', got '%s'", result.Questions[0].CorrectOptionID)
	}
	if result.Questions[1].CorrectOptionID != "c" {
		t.Errorf("expected answer 'c', got '%s'", result.Questions[1].CorrectOptionID)
	}
}
