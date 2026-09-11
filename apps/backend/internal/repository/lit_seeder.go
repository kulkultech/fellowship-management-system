package repository

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

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

// SeedLITAssessmentPrograms populates the LIT Scholarship 2026 program, tracks, and test banks into PostgreSQL.
// It associates the LIT Scholarship 2026 program exclusively with Ladies in Tech Network.
func SeedLITAssessmentPrograms(ctx context.Context, pool *pgxpool.Pool, targetOrgID string, logger *slog.Logger) error {
	if pool == nil || targetOrgID == "" {
		return nil
	}

	// Clean up any stale program (lit-sda)
	_, _ = pool.Exec(ctx, "DELETE FROM programs WHERE slug = 'lit-sda'")

	var data QuestionBankData
	if err := json.Unmarshal(litQuestionsJSON, &data); err != nil {
		return fmt.Errorf("seed_lit: unmarshal json: %w", err)
	}

	// 1. Seed Reusable Question Sets into Database for Ladies in Tech Network
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

	// 2. Restore LIT Scholarship 2026 Program to Ladies in Tech Network
	programs := []struct {
		Slug        string
		Name        string
		Description string
		ImageURL    string
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
			Name:        "LIT Scholarship 2026",
			Description: "The flagship talent acceleration scholarship program by Ladies in Tech Network and Kulkul Tech. Choose your specialization track to begin evaluation.",
			ImageURL:    "https://ladiesintech.network/wp-content/uploads/2026/07/lithero-1024x576.webp",
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

	litRubricJSON, _ := json.Marshal(model.DefaultLITRubric())

	for _, p := range programs {
		var progID string
		seedProgQuery := `
			INSERT INTO programs (
				organization_id, slug, name, description, image_url,
				open_date, end_date, logic_test_duration_minutes,
				logic_test_passing_score, allow_retake, status,
				enable_mcq, enable_ai_interview, ai_interview_rubric, created_at, updated_at
			)
			VALUES ($1::uuid, $2, $3, $4, $5, now() - INTERVAL '1 day', now() + INTERVAL '180 days', 35, 70, false, 'published', true, true, $6::jsonb, now(), now())
			ON CONFLICT (organization_id, slug) DO UPDATE SET
				name = EXCLUDED.name,
				description = EXCLUDED.description,
				image_url = EXCLUDED.image_url,
				status = 'published',
				enable_mcq = true,
				enable_ai_interview = true,
				ai_interview_rubric = EXCLUDED.ai_interview_rubric,
				updated_at = now()
			RETURNING id::text
		`
		if err := pool.QueryRow(ctx, seedProgQuery, targetOrgID, p.Slug, p.Name, p.Description, p.ImageURL, string(litRubricJSON)).Scan(&progID); err != nil {
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

		trackIDMap := make(map[string]string)
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
			trackIDMap[tr.Slug] = trackID

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

		// 3. Seed sample applicants for LIT Scholarship 2026 pipeline
		sampleApplicants := []struct {
			Name           string
			Email          string
			TrackSlug      string
			CurrentStage   string
			Phone          string
			University     string
			Major          string
			Semester       string
			ReferralSource string
			GithubURL      string
			LinkedinURL    string
			ProfilePicURL  string
		}{
			{
				Name:           "Ada Lovelace",
				Email:          "ada.lovelace@techladies.io",
				TrackSlug:      "fullstack",
				CurrentStage:   "ai_interview_complete",
				Phone:          "+628123456701",
				University:     "Universitas Indonesia",
				Major:          "Computer Science",
				Semester:       "Semester 7",
				ReferralSource: "Instagram",
				GithubURL:      "https://github.com/ada-techladies",
				LinkedinURL:    "https://linkedin.com/in/ada-lovelace",
				ProfilePicURL:  "https://api.dicebear.com/7.x/bottts/svg?seed=Ada",
			},
			{
				Name:           "Grace Hopper",
				Email:          "grace.hopper@navy.gov",
				TrackSlug:      "fullstack",
				CurrentStage:   "logic_test_complete",
				Phone:          "+628123456702",
				University:     "Institut Teknologi Bandung",
				Major:          "Informatics",
				Semester:       "Semester 8",
				ReferralSource: "LinkedIn",
				GithubURL:      "https://github.com/grace-hopper",
				LinkedinURL:    "https://linkedin.com/in/grace-hopper",
				ProfilePicURL:  "https://api.dicebear.com/7.x/bottts/svg?seed=Grace",
			},
			{
				Name:           "Sarah Connor",
				Email:          "sarah.connor@cyberdyne.ai",
				TrackSlug:      "qa-automation",
				CurrentStage:   "applied",
				Phone:          "+628123456703",
				University:     "Universitas Gadjah Mada",
				Major:          "Information Systems",
				Semester:       "Final Semester",
				ReferralSource: "Friend/Colleague",
				GithubURL:      "https://github.com/sarah-connor",
				LinkedinURL:    "https://linkedin.com/in/sarah-connor",
				ProfilePicURL:  "https://api.dicebear.com/7.x/bottts/svg?seed=Sarah",
			},
			{
				Name:           "Hedy Lamarr",
				Email:          "hedy.lamarr@broadband.tech",
				TrackSlug:      "qa-automation",
				CurrentStage:   "final_review",
				Phone:          "+628123456704",
				University:     "Binus University",
				Major:          "Computer Engineering",
				Semester:       "Semester 8",
				ReferralSource: "Community/Event",
				GithubURL:      "https://github.com/hedy-lamarr",
				LinkedinURL:    "https://linkedin.com/in/hedy-lamarr",
				ProfilePicURL:  "https://api.dicebear.com/7.x/bottts/svg?seed=Hedy",
			},
		}

		for _, sa := range sampleApplicants {
			var appID string
			trackID := trackIDMap[sa.TrackSlug]
			insertAppQuery := `
				INSERT INTO applicants (
					organization_id, program_id, track_id, email, full_name,
					phone, university, major, semester, referral_source,
					github_url, linkedin_url, profile_picture_url, current_stage,
					created_at, updated_at
				)
				VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())
				ON CONFLICT (program_id, email) DO UPDATE SET
					organization_id = EXCLUDED.organization_id,
					track_id = EXCLUDED.track_id,
					full_name = EXCLUDED.full_name,
					current_stage = EXCLUDED.current_stage,
					updated_at = now()
				RETURNING id::text
			`
			if err := pool.QueryRow(ctx, insertAppQuery, targetOrgID, progID, trackID, sa.Email, sa.Name, sa.Phone, sa.University, sa.Major, sa.Semester, sa.ReferralSource, sa.GithubURL, sa.LinkedinURL, sa.ProfilePicURL, sa.CurrentStage).Scan(&appID); err == nil {
				if sa.CurrentStage == "logic_test_complete" || sa.CurrentStage == "ai_interview_complete" || sa.CurrentStage == "final_review" {
					insertSub := `
						INSERT INTO test_submissions (
							applicant_id, program_id, track_id, test_token, status,
							started_at, submitted_at, completed_at, answers, total_score, passed,
							time_spent_seconds, created_at, updated_at
						)
						VALUES ($1::uuid, $2::uuid, $3::uuid, gen_random_uuid()::text, 'completed', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', '{}'::jsonb, 85, true, 1200, now(), now())
						ON CONFLICT DO NOTHING
					`
					_, _ = pool.Exec(ctx, insertSub, appID, progID, trackID)
				}
			}
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
	case strings.Contains(qLower, "cypress") || strings.Contains(qLower, "cy.") || strings.Contains(qLower, "e2e"):
		return "Cypress & UI"
	case strings.Contains(qLower, "postman") || strings.Contains(qLower, "status code") || strings.Contains(qLower, "401") || strings.Contains(qLower, "403"):
		return "Postman & API Testing"
	case strings.Contains(qLower, "test plan") || strings.Contains(qLower, "regression") || strings.Contains(qLower, "smoke") || strings.Contains(qLower, "san"):
		return "Testing Strategy"
	default:
		return "General Engineering"
	}
}
