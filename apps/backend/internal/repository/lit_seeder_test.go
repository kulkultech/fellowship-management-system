package repository

import (
	"bufio"
	"bytes"
	"strings"
	"testing"
)

func TestParseLITAssessment2026CSV(t *testing.T) {
	scanner := bufio.NewScanner(bytes.NewReader(litAssessmentCSV))
	var lines []string
	for scanner.Scan() {
		text := strings.TrimSpace(scanner.Text())
		if text != "" {
			lines = append(lines, text)
		}
	}

	if len(lines) == 0 {
		t.Fatalf("expected CSV content, got 0 lines")
	}

	// Header line
	header := lines[0]
	if !strings.Contains(header, "Question No") || !strings.Contains(header, "Correct Answer") {
		t.Fatalf("unexpected header line: %s", header)
	}

	// 40 questions expected
	dataLines := lines[1:]
	if len(dataLines) != 40 {
		t.Fatalf("expected exactly 40 question lines in CSV, got %d", len(dataLines))
	}

	validAnswers := map[string]bool{"a": true, "b": true, "c": true, "d": true}

	for idx, line := range dataLines {
		parts := splitSemicolonCSV(line)
		if len(parts) < 7 {
			t.Errorf("line %d: expected at least 7 parts, got %d in line: %s", idx+1, len(parts), line)
			continue
		}

		ans := strings.ToLower(parts[len(parts)-1])
		if !validAnswers[ans] {
			t.Errorf("line %d: invalid correct answer '%s'", idx+1, ans)
		}

		cA := parts[len(parts)-5]
		cB := parts[len(parts)-4]
		cC := parts[len(parts)-3]
		cD := parts[len(parts)-2]

		if cA == "" || cB == "" || cC == "" || cD == "" {
			t.Errorf("line %d: one or more choices are empty: A='%s', B='%s', C='%s', D='%s'", idx+1, cA, cB, cC, cD)
		}

		firstSemi := strings.Index(line, ";")
		lastFifthSemi := -1
		semiCount := 0
		for i := len(line) - 1; i >= 0; i-- {
			if line[i] == ';' {
				semiCount++
				if semiCount == 5 {
					lastFifthSemi = i
					break
				}
			}
		}

		qText := ""
		if firstSemi != -1 && lastFifthSemi != -1 && lastFifthSemi > firstSemi {
			qText = strings.TrimSpace(line[firstSemi+1 : lastFifthSemi])
			qText = strings.Trim(qText, "\"")
		} else {
			qText = strings.Join(parts[1:len(parts)-5], "; ")
		}

		if len(qText) < 5 {
			t.Errorf("line %d: question text is too short or empty: '%s'", idx+1, qText)
		}

		category := determineLITCategory(qText)
		if category == "" {
			t.Errorf("line %d: category returned empty", idx+1)
		}
	}
}
