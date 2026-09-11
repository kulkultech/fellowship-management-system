package repository

import (
	"bufio"
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/model"
)

type CSVImportResult struct {
	Questions []model.MCQQuestion `json:"questions"`
	TotalRows int                 `json:"total_rows"`
	ValidRows int                 `json:"valid_rows"`
	Errors    []string            `json:"errors,omitempty"`
}

// ParseQuestionsFromCSV parses questions from a CSV reader supporting semicolon or comma delimiters.
func ParseQuestionsFromCSV(r io.Reader, defaultCategory string) (*CSVImportResult, error) {
	scanner := bufio.NewScanner(r)
	var lines []string
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			lines = append(lines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read csv: %w", err)
	}
	if len(lines) == 0 {
		return &CSVImportResult{}, nil
	}

	result := &CSVImportResult{
		TotalRows: len(lines) - 1, // minus header
	}

	// Detect delimiter from header
	headerLine := lines[0]
	delimiter := ','
	if strings.Count(headerLine, ";") > strings.Count(headerLine, ",") {
		delimiter = ';'
	}

	if defaultCategory == "" {
		defaultCategory = "General"
	}

	for rowIdx, line := range lines[1:] {
		rowNum := rowIdx + 2 // 1-based index including header
		q, err := parseCSVLine(line, delimiter, defaultCategory)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Row %d: %v", rowNum, err))
			continue
		}
		result.Questions = append(result.Questions, *q)
		result.ValidRows++
	}

	return result, nil
}

func parseCSVLine(line string, delimiter rune, defaultCategory string) (*model.MCQQuestion, error) {
	var parts []string

	// Check if line has code snippet with extra delimiters
	delStr := string(delimiter)
	extraDelims := strings.Count(line, delStr) > 6

	if extraDelims {
		// Prefer code preservation split
		parts = splitDelimitedWithCodePreservation(line, delimiter)
	} else {
		reader := csv.NewReader(strings.NewReader(line))
		reader.Comma = delimiter
		reader.LazyQuotes = true
		records, err := reader.Read()
		if err == nil && len(records) >= 6 {
			parts = records
		} else {
			parts = splitDelimitedWithCodePreservation(line, delimiter)
		}
	}

	if len(parts) < 6 {
		return nil, fmt.Errorf("insufficient columns (found %d, minimum 6 required)", len(parts))
	}

	n := len(parts)
	rawAns := strings.TrimSpace(parts[n-1])
	cD := strings.TrimSpace(parts[n-2])
	cC := strings.TrimSpace(parts[n-3])
	cB := strings.TrimSpace(parts[n-4])
	cA := strings.TrimSpace(parts[n-5])

	var qText string
	if n == 6 {
		qText = strings.TrimSpace(parts[0])
	} else if n == 7 {
		qText = strings.TrimSpace(parts[1])
	} else {
		// Join middle parts as question text
		qText = strings.TrimSpace(strings.Join(parts[1:n-5], delStr+" "))
	}

	// Clean quotes
	qText = strings.Trim(qText, "\"")
	cA = strings.Trim(cA, "\"")
	cB = strings.Trim(cB, "\"")
	cC = strings.Trim(cC, "\"")
	cD = strings.Trim(cD, "\"")
	rawAns = strings.Trim(rawAns, "\"")

	if qText == "" {
		return nil, fmt.Errorf("question text cannot be empty")
	}
	if cA == "" || cB == "" || cC == "" || cD == "" {
		return nil, fmt.Errorf("all 4 options (A, B, C, D) are required")
	}

	correctAnsID := normalizeAnswerID(rawAns)
	if correctAnsID == "" {
		return nil, fmt.Errorf("invalid correct answer '%s' (must be A, B, C, or D)", rawAns)
	}

	cat := inferQuestionCategory(qText, defaultCategory)

	var correctText string
	switch correctAnsID {
	case "a":
		correctText = cA
	case "b":
		correctText = cB
	case "c":
		correctText = cC
	case "d":
		correctText = cD
	}

	explanation := fmt.Sprintf("Correct answer is (%s): %s.", strings.ToUpper(correctAnsID), correctText)

	return &model.MCQQuestion{
		ID:       uuid.New(),
		Category: cat,
		QuestionText: qText,
		Options: []model.MCQOption{
			{ID: "a", Text: cA},
			{ID: "b", Text: cB},
			{ID: "c", Text: cC},
			{ID: "d", Text: cD},
		},
		CorrectOptionID: correctAnsID,
		Explanation:     explanation,
		Points:          10,
	}, nil
}

func normalizeAnswerID(raw string) string {
	val := strings.ToLower(strings.TrimSpace(raw))
	switch val {
	case "a", "1", "choice a", "option a":
		return "a"
	case "b", "2", "choice b", "option b":
		return "b"
	case "c", "3", "choice c", "option c":
		return "c"
	case "d", "4", "choice d", "option d":
		return "d"
	default:
		return ""
	}
}

func splitDelimitedWithCodePreservation(line string, delimiter rune) []string {
	delStr := string(delimiter)
	firstDelim := strings.Index(line, delStr)
	if firstDelim == -1 {
		return []string{line}
	}

	// Count from the end: Correct Answer, Choice D, Choice C, Choice B, Choice A (5 delimiters from end)
	lastFifthDelim := -1
	count := 0
	for i := len(line) - 1; i >= 0; i-- {
		if rune(line[i]) == delimiter {
			count++
			if count == 5 {
				lastFifthDelim = i
				break
			}
		}
	}

	if lastFifthDelim != -1 && lastFifthDelim > firstDelim {
		// Question No is line[:firstDelim]
		// Question is line[firstDelim+1:lastFifthDelim]
		// Rest are options + answer
		qNum := strings.TrimSpace(line[:firstDelim])
		qText := strings.TrimSpace(line[firstDelim+1 : lastFifthDelim])

		rest := strings.Split(line[lastFifthDelim+1:], delStr)
		parts := []string{qNum, qText}
		for _, r := range rest {
			parts = append(parts, strings.TrimSpace(r))
		}
		return parts
	}

	// Basic fallback split
	var parts []string
	for _, p := range strings.Split(line, delStr) {
		parts = append(parts, strings.TrimSpace(p))
	}
	return parts
}

func inferQuestionCategory(q string, defaultCat string) string {
	qLower := strings.ToLower(q)
	switch {
	case strings.Contains(qLower, "javascript") || strings.Contains(qLower, "typeof") || strings.Contains(qLower, "promise"):
		return "JavaScript"
	case strings.Contains(qLower, "java ") || strings.Contains(qLower, "java,") || strings.Contains(qLower, "in java") || strings.Contains(qLower, "system.out"):
		return "Java"
	case strings.Contains(qLower, "http") || strings.Contains(qLower, "fetch()") || strings.Contains(qLower, "restful") || strings.Contains(qLower, "rate limiting"):
		return "Web & APIs"
	case strings.Contains(qLower, "cypress") || strings.Contains(qLower, "postman"):
		return "QA Automation"
	case strings.Contains(qLower, "testing") || strings.Contains(qLower, "verification and validation") || strings.Contains(qLower, "defect density") || strings.Contains(qLower, "smoke test"):
		return "Quality Assurance"
	case strings.Contains(qLower, "git"):
		return "Git & Version Control"
	case strings.Contains(qLower, "maven"):
		return "Build Tools"
	case strings.Contains(qLower, "jenkins"):
		return "CI/CD & DevOps"
	case strings.Contains(qLower, "eslint"):
		return "Code Quality"
	case strings.Contains(qLower, "sql"):
		return "Databases & SQL"
	default:
		if defaultCat != "" {
			return defaultCat
		}
		return "General Assessment"
	}
}
