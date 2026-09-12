package repository

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed default_questions_data.json
var defaultQuestionsJSON []byte

type QuestionBankData struct {
	QAAssessment        []QuestionItem `json:"qa_assessment"`
	FullstackAssessment []QuestionItem `json:"fullstack_assessment"`
}

type QuestionItem struct {
	Category        string       `json:"category"`
	QuestionText    string       `json:"question_text"`
	Options         []OptionItem `json:"options"`
	CorrectOptionID string       `json:"correct_option_id"`
	Explanation     string       `json:"explanation"`
	Points          int          `json:"points"`
}

type OptionItem struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// SeedDefaultAssessmentPrograms populates standard assessment question banks into PostgreSQL.
func SeedDefaultAssessmentPrograms(ctx context.Context, pool *pgxpool.Pool, targetOrgID string, logger *slog.Logger) error {
	if pool == nil || targetOrgID == "" {
		return nil
	}

	_, _ = pool.Exec(ctx, "UPDATE question_sets SET organization_id = $1::uuid WHERE id IN ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000023')", targetOrgID)

	var data QuestionBankData
	if err := json.Unmarshal(defaultQuestionsJSON, &data); err != nil {
		return fmt.Errorf("seed_default: unmarshal json: %w", err)
	}

	// 1. Seed Reusable Question Sets into Database
	questionSets := []struct {
		ID              string
		Name            string
		Description     string
		Category        string
		DurationMinutes int
		PassingScore    int
		Questions       []QuestionItem
	}{
		{
			ID:              "00000000-0000-0000-0000-000000000021",
			Name:            "Fullstack Software Engineering Assessment",
			Description:     "Comprehensive problem-solving test bank evaluating JavaScript DOM, React, REST APIs, and core algorithms.",
			Category:        "Software Engineering",
			DurationMinutes: 35,
			PassingScore:    70,
			Questions:       data.FullstackAssessment,
		},
		{
			ID:              "00000000-0000-0000-0000-000000000022",
			Name:            "QA & Test Automation Screening",
			Description:     "Comprehensive QA question set covering Cypress, Postman, Systems, and regression testing.",
			Category:        "Quality Assurance",
			DurationMinutes: 35,
			PassingScore:    70,
			Questions:       data.QAAssessment,
		},
		{
			ID:              "00000000-0000-0000-0000-000000000023",
			Name:            "General Logic & Cognitive Assessment",
			Description:     "Standardized cognitive problem solving, numerical patterns, and logical deductions.",
			Category:        "General Logic",
			DurationMinutes: 20,
			PassingScore:    60,
			Questions:       nil,
		},
	}

	for _, qs := range questionSets {
		seedSetQuery := `
			INSERT INTO question_sets (
				id, organization_id, name, description, category,
				duration_minutes, passing_score, created_at, updated_at
			)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, now(), now())
			ON CONFLICT (id) DO UPDATE SET
				organization_id = EXCLUDED.organization_id,
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				category = EXCLUDED.category,
				duration_minutes = EXCLUDED.duration_minutes,
				passing_score = EXCLUDED.passing_score,
				updated_at = now()
		`
		if _, err := pool.Exec(ctx, seedSetQuery, qs.ID, targetOrgID, qs.Name, qs.Description, qs.Category, qs.DurationMinutes, qs.PassingScore); err != nil {
			logger.Warn("seed_lit: error upserting question set", slog.String("name", qs.Name), slog.Any("error", err))
		}

		if len(qs.Questions) > 0 {
			_, _ = pool.Exec(ctx, "DELETE FROM mcq_questions WHERE question_set_id = $1::uuid", qs.ID)
			for _, q := range qs.Questions {
				optsJSON, _ := json.Marshal(q.Options)
				insertQ := `
					INSERT INTO mcq_questions (question_set_id, category, question_text, options, correct_option_id, explanation, points, created_at)
					VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7, now())
				`
				points := q.Points
				if points <= 0 {
					points = 10
				}
				_, _ = pool.Exec(ctx, insertQ, qs.ID, q.Category, q.QuestionText, string(optsJSON), q.CorrectOptionID, q.Explanation, points)
			}
			logger.Info("Seeded question set questions to database", slog.String("set", qs.Name), slog.Int("count", len(qs.Questions)))
		}
	}

	return nil
}

func determineLITCategory(q string) string {
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
		return "General Assessment"
	}
}

func splitSemicolonCSV(line string) []string {
	var parts []string
	var current strings.Builder
	inQuotes := false

	for i := 0; i < len(line); i++ {
		c := line[i]
		if c == '"' {
			inQuotes = !inQuotes
		} else if c == ';' && !inQuotes {
			part := strings.TrimSpace(current.String())
			part = strings.Trim(part, "\"")
			parts = append(parts, part)
			current.Reset()
			continue
		}
		current.WriteByte(c)
	}
	lastPart := strings.TrimSpace(current.String())
	lastPart = strings.Trim(lastPart, "\"")
	parts = append(parts, lastPart)
	return parts
}

// SeedLITAssessmentPrograms is a backwards-compatible alias for SeedDefaultAssessmentPrograms
func SeedLITAssessmentPrograms(ctx context.Context, pool *pgxpool.Pool, targetOrgID string, logger *slog.Logger) error {
	return SeedDefaultAssessmentPrograms(ctx, pool, targetOrgID, logger)
}
