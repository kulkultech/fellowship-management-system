package repository

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed lit_questions_data.json
var litQuestionsJSON []byte

type QuestionBankData struct {
	QAAssessment        []QuestionItem `json:"qa_assessment"`
	FullstackAssessment []QuestionItem `json:"fullstack_assessment"`
	SDAAssessment       []QuestionItem `json:"sda_assessment"`
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

// SeedLITAssessmentPrograms populates all LIT 2025/2026 tracks and their MCQ test banks into PostgreSQL.
func SeedLITAssessmentPrograms(ctx context.Context, pool *pgxpool.Pool, rsaOrgID string, logger *slog.Logger) error {
	if pool == nil || rsaOrgID == "" {
		return nil
	}

	var data QuestionBankData
	if err := json.Unmarshal(litQuestionsJSON, &data); err != nil {
		return fmt.Errorf("seed_lit: unmarshal json: %w", err)
	}

	programs := []struct {
		Slug        string
		Name        string
		Description string
		Questions   []QuestionItem
	}{
		{
			Slug:        "lit2026",
			Name:        "LIT 2026 Fellowship & QA Assessment",
			Description: "The flagship talent acceleration fellowship program by RSA and Kulkul Tech. Focuses on QA Automation, Cypress, Postman, Systems, and Problem Solving.",
			Questions:   data.QAAssessment,
		},
		{
			Slug:        "lit-fullstack",
			Name:        "LIT Fullstack Software Engineering",
			Description: "Comprehensive Fullstack Assessment covering Frontend (HTML/CSS/JS/DOM), Backend (Java/OOP/Systems), and REST API Architecture.",
			Questions:   data.FullstackAssessment,
		},
		{
			Slug:        "lit-sda",
			Name:        "LIT Service Desk Analyst (SDA)",
			Description: "Service Desk Analyst evaluation assessing ITIL Incident Management, Customer Empathy, SLA Prioritization, and Support KPIs.",
			Questions:   data.SDAAssessment,
		},
	}

	for _, p := range programs {
		var progID string
		seedProgQuery := `
			INSERT INTO programs (
				organization_id, slug, name, description,
				open_date, end_date, logic_test_duration_minutes,
				logic_test_passing_score, allow_retake, status,
				enable_mcq, enable_ai_interview, created_at, updated_at
			)
			VALUES ($1::uuid, $2, $3, $4, now() - INTERVAL '1 day', now() + INTERVAL '180 days', 35, 70, false, 'published', true, true, now(), now())
			ON CONFLICT (organization_id, slug) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				updated_at = now()
			RETURNING id::text
		`
		if err := pool.QueryRow(ctx, seedProgQuery, rsaOrgID, p.Slug, p.Name, p.Description).Scan(&progID); err != nil {
			logger.Warn("seed_lit: error upserting program", slog.String("slug", p.Slug), slog.Any("error", err))
			continue
		}

		// Replace or sync questions for this program
		if len(p.Questions) > 0 {
			// Remove previous questions for clean sync
			_, _ = pool.Exec(ctx, "DELETE FROM mcq_questions WHERE program_id = $1::uuid", progID)

			for _, q := range p.Questions {
				optsJSON, _ := json.Marshal(q.Options)
				insertQ := `
					INSERT INTO mcq_questions (program_id, category, question_text, options, correct_option_id, explanation, points, created_at)
					VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7, now())
				`
				points := q.Points
				if points <= 0 {
					points = 10
				}
				if _, err := pool.Exec(ctx, insertQ, progID, q.Category, q.QuestionText, string(optsJSON), q.CorrectOptionID, q.Explanation, points); err != nil {
					logger.Warn("seed_lit: error inserting question", slog.String("program", p.Slug), slog.Any("error", err))
				}
			}
			logger.Info("Seeded program questions to database", slog.String("slug", p.Slug), slog.Int("count", len(p.Questions)))
		}
	}

	return nil
}
