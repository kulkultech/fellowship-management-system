package repository

import (
	"bufio"
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/kulkul/backend/internal/model"
)

//go:embed lit_questions_data.json
var litQuestionsJSON []byte

//go:embed lit_assessment_2026.csv
var litAssessmentCSV []byte

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

	// Clean up any stale program (lit-sda)
	_, _ = pool.Exec(ctx, "DELETE FROM programs WHERE organization_id = $1::uuid AND slug = 'lit-sda'", rsaOrgID)

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
			Description: "The flagship talent acceleration fellowship program by Acme Academy and Kulkul Tech. Choose your specialization track to begin evaluation.",
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

// SeedLadiesInTechNetwork seeds the "Ladies in Tech Network" company, its admin user, and the 40-question Question Bank.
func SeedLadiesInTechNetwork(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	if pool == nil {
		return nil
	}

	orgSlug := "ladies-in-tech-network"
	orgName := "Ladies in Tech Network"
	litOrgUUID := "00000000-0000-0000-0000-000000000004"

	// 1. Ensure Organization exists
	var orgID string
	insertOrgQuery := `
		INSERT INTO organizations (id, slug, name, logo_url, status, contact_email, created_at, updated_at)
		VALUES ($1::uuid, $2, $3, '', 'approved', 'contact@ladiesintech.net', now(), now())
		ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'approved', updated_at = now()
		RETURNING id::text
	`
	if err := pool.QueryRow(ctx, insertOrgQuery, litOrgUUID, orgSlug, orgName).Scan(&orgID); err != nil {
		_ = pool.QueryRow(ctx, "SELECT id::text FROM organizations WHERE slug = $1 OR name ILIKE $2 LIMIT 1", orgSlug, orgName).Scan(&orgID)
	}
	if orgID == "" {
		orgID = litOrgUUID
	}

	// 2. Ensure Admin User exists
	adminPassHash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	seedUserQuery := `
		INSERT INTO users (organization_id, email, password_hash, name, role, created_at, updated_at)
		VALUES ($1::uuid, 'admin@ladiesintech.net', $2, 'Ladies in Tech Admin', 'org_admin', now(), now())
		ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = 'org_admin', updated_at = now()
	`
	if _, err := pool.Exec(ctx, seedUserQuery, orgID, string(adminPassHash)); err != nil {
		logger.Warn("seed_lit_network: admin user upsert error", slog.Any("error", err))
	}

	// 3. Ensure Question Set exclusively for Ladies in Tech Network
	setID := "00000000-0000-0000-0000-000000000040"
	setName := "General Fullstack & QA LIT Assessment 2026"
	setDesc := "Comprehensive assessment question bank covering JavaScript, Java, Web & REST APIs, QA & Test Automation (Cypress, Postman), Git, Build Tools, and SQL."
	setCategory := "Fullstack & QA"

	seedSetQuery := `
		INSERT INTO question_sets (
			id, organization_id, program_id, name, description, category,
			duration_minutes, passing_score, created_at, updated_at
		)
		VALUES ($1::uuid, $2::uuid, NULL, $3, $4, $5, 40, 70, now(), now())
		ON CONFLICT (id) DO UPDATE SET
			organization_id = EXCLUDED.organization_id,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			category = EXCLUDED.category,
			duration_minutes = EXCLUDED.duration_minutes,
			passing_score = EXCLUDED.passing_score,
			updated_at = now()
	`
	if _, err := pool.Exec(ctx, seedSetQuery, setID, orgID, setName, setDesc, setCategory); err != nil {
		logger.Warn("seed_lit_network: question set upsert error", slog.Any("error", err))
		return err
	}

	// 4. Parse CSV lines and populate mcq_questions
	scanner := bufio.NewScanner(bytes.NewReader(litAssessmentCSV))
	var lines []string
	for scanner.Scan() {
		text := strings.TrimSpace(scanner.Text())
		if text != "" {
			lines = append(lines, text)
		}
	}

	if len(lines) > 1 {
		_, _ = pool.Exec(ctx, "DELETE FROM mcq_questions WHERE question_set_id = $1::uuid", setID)
		insertCount := 0
		for _, line := range lines[1:] {
			parts := splitSemicolonCSV(line)
			if len(parts) < 7 {
				continue
			}
			ans := strings.ToLower(parts[len(parts)-1])
			cD := parts[len(parts)-2]
			cC := parts[len(parts)-3]
			cB := parts[len(parts)-4]
			cA := parts[len(parts)-5]

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

			cat := determineLITCategory(qText)
			var correctText string
			switch ans {
			case "a":
				correctText = cA
			case "b":
				correctText = cB
			case "c":
				correctText = cC
			case "d":
				correctText = cD
			}
			explanation := fmt.Sprintf("Correct answer is (%s): %s.", strings.ToUpper(ans), correctText)

			opts := []OptionItem{
				{ID: "a", Text: cA},
				{ID: "b", Text: cB},
				{ID: "c", Text: cC},
				{ID: "d", Text: cD},
			}
			optsJSON, _ := json.Marshal(opts)

			insertQ := `
				INSERT INTO mcq_questions (
					id, program_id, question_set_id, category, question_text, options,
					correct_option_id, explanation, points, created_at, updated_at
				)
				VALUES (gen_random_uuid(), NULL, $1::uuid, $2, $3, $4::jsonb, $5, $6, 10, now(), now())
			`
			if _, err := pool.Exec(ctx, insertQ, setID, cat, qText, string(optsJSON), ans, explanation); err == nil {
				insertCount++
			}
		}
		logger.Info("Seeded Ladies in Tech Network question bank", slog.String("company", orgName), slog.String("set", setName), slog.Int("count", insertCount))
	}

	return nil
}

