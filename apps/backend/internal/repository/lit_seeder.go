package repository

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kulkul/backend/internal/model"
)

//go:embed lit_questions_data.json
var litQuestionsJSON []byte

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

// SeedLITAssessmentPrograms populates all LIT 2025/2026 tracks and their MCQ test banks into PostgreSQL.
func SeedLITAssessmentPrograms(ctx context.Context, pool *pgxpool.Pool, rsaOrgID string, logger *slog.Logger) error {
	if pool == nil || rsaOrgID == "" {
		return nil
	}

	// Clean up any stale programs (e.g. lit-sda)
	_, _ = pool.Exec(ctx, "DELETE FROM programs WHERE organization_id = $1::uuid AND slug NOT IN ('lit2026')", rsaOrgID)

	var data QuestionBankData
	if err := json.Unmarshal(litQuestionsJSON, &data); err != nil {
		return fmt.Errorf("seed_lit: unmarshal json: %w", err)
	}

	programs := []struct {
		Slug        string
		Name        string
		Description string
		Tracks      []struct {
			Slug          string
			Name          string
			Description   string
			QuestionSetID string
			Questions     []QuestionItem
		}
	}{
		{
			Slug:        "lit2026",
			Name:        "LIT 2026 Fellowship Program",
			Description: "The flagship talent acceleration fellowship program by Remote Skills Academy and Kulkul Tech. Choose your specialization track to begin evaluation.",
			Tracks: []struct {
				Slug          string
				Name          string
				Description   string
				QuestionSetID string
				Questions     []QuestionItem
			}{
				{
					Slug:          "fullstack",
					Name:          "Fullstack Software Engineering Track",
					Description:   "Fullstack engineering assessment covering modern JS DOM, HTML/CSS, Java OOP, and REST APIs.",
					QuestionSetID: "00000000-0000-0000-0000-000000000021",
					Questions:     data.FullstackAssessment,
				},
				{
					Slug:          "qa-automation",
					Name:          "QA & Test Automation Track",
					Description:   "Hands-on assessment covering Cypress, Postman, Systems, Regression testing, and problem solving.",
					QuestionSetID: "00000000-0000-0000-0000-000000000022",
					Questions:     data.QAAssessment,
				},
			},
		},
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
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				category = EXCLUDED.category,
				duration_minutes = EXCLUDED.duration_minutes,
				passing_score = EXCLUDED.passing_score,
				updated_at = now()
		`
		if _, err := pool.Exec(ctx, seedSetQuery, qs.ID, rsaOrgID, qs.Name, qs.Description, qs.Category, qs.DurationMinutes, qs.PassingScore); err != nil {
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

	litRubricJSON, _ := json.Marshal(model.DefaultLITRubric())

	for _, p := range programs {
		var progID string
		seedProgQuery := `
			INSERT INTO programs (
				organization_id, slug, name, description,
				open_date, end_date, logic_test_duration_minutes,
				logic_test_passing_score, allow_retake, status,
				enable_mcq, enable_ai_interview, ai_interview_rubric, created_at, updated_at
			)
			VALUES ($1::uuid, $2, $3, $4, now() - INTERVAL '1 day', now() + INTERVAL '180 days', 35, 70, false, 'published', true, true, $5::jsonb, now(), now())
			ON CONFLICT (organization_id, slug) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				ai_interview_rubric = EXCLUDED.ai_interview_rubric,
				updated_at = now()
			RETURNING id::text
		`
		if err := pool.QueryRow(ctx, seedProgQuery, rsaOrgID, p.Slug, p.Name, p.Description, string(litRubricJSON)).Scan(&progID); err != nil {
			logger.Warn("seed_lit: error upserting program", slog.String("slug", p.Slug), slog.Any("error", err))
			continue
		}

		// Clean up any stale tracks that are no longer in the track list for this program
		var validSlugs []string
		for _, tr := range p.Tracks {
			validSlugs = append(validSlugs, tr.Slug)
		}
		if len(validSlugs) > 0 {
			_, _ = pool.Exec(ctx, "DELETE FROM program_tracks WHERE program_id = $1::uuid AND slug != ALL($2)", progID, validSlugs)
		}

		for _, tr := range p.Tracks {
			var trackID string
			seedTrackQuery := `
				INSERT INTO program_tracks (
					program_id, question_set_id, slug, name, description,
					enable_mcq, logic_test_duration_minutes, logic_test_passing_score,
					allow_retake, enable_ai_interview, ai_interview_rubric, created_at, updated_at
				)
				VALUES ($1::uuid, $2::uuid, $3, $4, $5, true, 35, 70, false, true, $6::jsonb, now(), now())
				ON CONFLICT (program_id, slug) DO UPDATE SET
					question_set_id = EXCLUDED.question_set_id,
					name = EXCLUDED.name,
					description = EXCLUDED.description,
					ai_interview_rubric = EXCLUDED.ai_interview_rubric,
					updated_at = now()
				RETURNING id::text
			`
			if err := pool.QueryRow(ctx, seedTrackQuery, progID, tr.QuestionSetID, tr.Slug, tr.Name, tr.Description, string(litRubricJSON)).Scan(&trackID); err != nil {
				logger.Warn("seed_lit: error upserting track", slog.String("program", p.Slug), slog.String("track", tr.Slug), slog.Any("error", err))
				continue
			}

			// Replace track questions
			if len(tr.Questions) > 0 {
				_, _ = pool.Exec(ctx, "DELETE FROM mcq_questions WHERE track_id = $1::uuid OR (program_id = $2::uuid AND track_id IS NULL)", trackID, progID)

				for _, q := range tr.Questions {
					optsJSON, _ := json.Marshal(q.Options)
					insertQ := `
						INSERT INTO mcq_questions (program_id, track_id, question_set_id, category, question_text, options, correct_option_id, explanation, points, created_at)
						VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7, $8, $9, now())
					`
					points := q.Points
					if points <= 0 {
						points = 10
					}
					if _, err := pool.Exec(ctx, insertQ, progID, trackID, tr.QuestionSetID, q.Category, q.QuestionText, string(optsJSON), q.CorrectOptionID, q.Explanation, points); err != nil {
						logger.Warn("seed_lit: error inserting question", slog.String("program", p.Slug), slog.String("track", tr.Slug), slog.Any("error", err))
					}
				}
				logger.Info("Seeded track questions to database", slog.String("program", p.Slug), slog.String("track", tr.Slug), slog.Int("count", len(tr.Questions)))
			}
		}
	}

	return nil
}
