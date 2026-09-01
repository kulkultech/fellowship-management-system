package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kulkul/backend/internal/model"
)

var ErrQuestionSetNotFound = errors.New("question set not found")

type QuestionSetRepository struct {
	pool           *pgxpool.Pool
	mu             sync.RWMutex
	memSets        map[uuid.UUID]*model.QuestionSet
	memQuestions   map[uuid.UUID][]model.MCQQuestion
	defaultProgID  uuid.UUID
}

func NewQuestionSetRepository(pool *pgxpool.Pool) *QuestionSetRepository {
	progID := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	set1ID := uuid.MustParse("00000000-0000-0000-0000-000000000021") // Fullstack
	set2ID := uuid.MustParse("00000000-0000-0000-0000-000000000022") // QA
	set3ID := uuid.MustParse("00000000-0000-0000-0000-000000000023") // General Logic

	repo := &QuestionSetRepository{
		pool:          pool,
		memSets:       make(map[uuid.UUID]*model.QuestionSet),
		memQuestions: make(map[uuid.UUID][]model.MCQQuestion),
		defaultProgID: progID,
	}

	// Parse embedded question banks for seeds
	var bank QuestionBankData
	_ = json.Unmarshal(litQuestionsJSON, &bank)

	var fsQuestions []model.MCQQuestion
	for _, q := range bank.FullstackAssessment {
		var opts []model.MCQOption
		for _, o := range q.Options {
			opts = append(opts, model.MCQOption{ID: o.ID, Text: o.Text})
		}
		points := q.Points
		if points <= 0 {
			points = 10
		}
		fsQuestions = append(fsQuestions, model.MCQQuestion{
			ID:              uuid.New(),
			ProgramID:       progID,
			QuestionSetID:   &set1ID,
			Category:        q.Category,
			QuestionText:    q.QuestionText,
			Options:         opts,
			CorrectOptionID: q.CorrectOptionID,
			Explanation:     q.Explanation,
			Points:          points,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		})
	}

	var qaQuestions []model.MCQQuestion
	for _, q := range bank.QAAssessment {
		var opts []model.MCQOption
		for _, o := range q.Options {
			opts = append(opts, model.MCQOption{ID: o.ID, Text: o.Text})
		}
		points := q.Points
		if points <= 0 {
			points = 10
		}
		qaQuestions = append(qaQuestions, model.MCQQuestion{
			ID:              uuid.New(),
			ProgramID:       progID,
			QuestionSetID:   &set2ID,
			Category:        q.Category,
			QuestionText:    q.QuestionText,
			Options:         opts,
			CorrectOptionID: q.CorrectOptionID,
			Explanation:     q.Explanation,
			Points:          points,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		})
	}

	// Seed In-Memory Sets
	repo.memSets[set1ID] = &model.QuestionSet{
		ID:              set1ID,
		ProgramID:       &progID,
		Name:            "Fullstack Software Engineering Assessment",
		Description:     "Comprehensive problem-solving test bank evaluating JavaScript DOM, React, REST APIs, and core algorithms.",
		Category:        "Software Engineering",
		DurationMinutes: 35,
		PassingScore:    70,
		Questions:       fsQuestions,
		TotalQuestions:  len(fsQuestions),
		TracksCount:     1,
		AssignedTracks:  []string{"Fullstack Software Engineering Track"},
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}
	repo.memQuestions[set1ID] = fsQuestions

	repo.memSets[set2ID] = &model.QuestionSet{
		ID:              set2ID,
		ProgramID:       &progID,
		Name:            "QA & Test Automation Screening",
		Description:     "Hands-on test bank evaluating Cypress, API testing, regression workflows, edge cases, and QA methodologies.",
		Category:        "Quality Assurance",
		DurationMinutes: 35,
		PassingScore:    70,
		Questions:       qaQuestions,
		TotalQuestions:  len(qaQuestions),
		TracksCount:     1,
		AssignedTracks:  []string{"QA & Test Automation Track"},
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}
	repo.memQuestions[set2ID] = qaQuestions

	// General Logic set
	genQuestions := []model.MCQQuestion{
		{
			ID:            uuid.New(),
			ProgramID:     progID,
			QuestionSetID: &set3ID,
			Category:      "Logic & Critical Thinking",
			QuestionText:  "Five people (A, B, C, D, E) sit in a row. A is to the left of B but to the right of C. D is to the right of B. Who is sitting in the exact middle?",
			Options: []model.MCQOption{
				{ID: "a", Text: "Person A"},
				{ID: "b", Text: "Person B"},
				{ID: "c", Text: "Person C"},
				{ID: "d", Text: "Person D"},
			},
			CorrectOptionID: "a",
			Explanation:     "The ordering is C, A, B, D, E. Person A is in the 2nd/middle position.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		{
			ID:            uuid.New(),
			ProgramID:     progID,
			QuestionSetID: &set3ID,
			Category:      "Pattern Recognition",
			QuestionText:  "Complete the number sequence: 2, 6, 12, 20, 30, ?",
			Options: []model.MCQOption{
				{ID: "a", Text: "38"},
				{ID: "b", Text: "40"},
				{ID: "c", Text: "42"},
				{ID: "d", Text: "44"},
			},
			CorrectOptionID: "c",
			Explanation:     "Differences between terms increase by 2: +4, +6, +8, +10, +12 -> 30 + 12 = 42.",
			Points:          10,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
	}
	repo.memSets[set3ID] = &model.QuestionSet{
		ID:              set3ID,
		ProgramID:       &progID,
		Name:            "General Logic & Cognitive Assessment",
		Description:     "Standardized cognitive problem solving, numerical patterns, and logical deductions.",
		Category:        "General Logic",
		DurationMinutes: 20,
		PassingScore:    60,
		Questions:       genQuestions,
		TotalQuestions:  len(genQuestions),
		TracksCount:     0,
		AssignedTracks:  []string{},
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}
	repo.memQuestions[set3ID] = genQuestions

	return repo
}

func (r *QuestionSetRepository) List(ctx context.Context, programID *uuid.UUID, orgID *uuid.UUID) ([]model.QuestionSet, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		list := make([]model.QuestionSet, 0, len(r.memSets))
		for _, s := range r.memSets {
			clone := *s
			qs := r.memQuestions[s.ID]
			clone.TotalQuestions = len(qs)
			clone.Questions = qs
			list = append(list, clone)
		}
		return list, nil
	}

	query := `
		SELECT
			qs.id, qs.organization_id, qs.program_id, qs.name, qs.description,
			qs.category, qs.duration_minutes, qs.passing_score, qs.created_at, qs.updated_at,
			COUNT(DISTINCT q.id) as question_count,
			COUNT(DISTINCT t.id) as tracks_count
		FROM question_sets qs
		LEFT JOIN mcq_questions q ON q.question_set_id = qs.id
		LEFT JOIN program_tracks t ON t.question_set_id = qs.id
		GROUP BY qs.id
		ORDER BY qs.created_at ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("qset_repo: list: %w", err)
	}
	defer rows.Close()

	var sets []model.QuestionSet
	for rows.Next() {
		var s model.QuestionSet
		var qCount, tCount int
		var desc *string
		err := rows.Scan(
			&s.ID, &s.OrganizationID, &s.ProgramID, &s.Name, &desc,
			&s.Category, &s.DurationMinutes, &s.PassingScore, &s.CreatedAt, &s.UpdatedAt,
			&qCount, &tCount,
		)
		if err != nil {
			return nil, fmt.Errorf("qset_repo: scan: %w", err)
		}
		if desc != nil {
			s.Description = *desc
		}
		s.TotalQuestions = qCount
		s.TracksCount = tCount
		sets = append(sets, s)
	}

	// If database question_sets table is empty, auto-seed with pre-configured default question sets
	if len(sets) == 0 {
		for _, memSet := range r.memSets {
			_, _ = r.Create(ctx, memSet)
		}
		// Re-fetch after seeding
		return r.List(ctx, programID, orgID)
	}

	// Also fetch questions for each set
	for i := range sets {
		qs, _ := r.ListQuestionsBySetID(ctx, sets[i].ID)
		sets[i].Questions = qs
		sets[i].TotalQuestions = len(qs)
	}

	return sets, nil
}

func (r *QuestionSetRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.QuestionSet, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		s, ok := r.memSets[id]
		if !ok {
			return nil, ErrQuestionSetNotFound
		}
		clone := *s
		clone.Questions = r.memQuestions[id]
		clone.TotalQuestions = len(clone.Questions)
		return &clone, nil
	}

	query := `
		SELECT
			id, organization_id, program_id, name, description,
			category, duration_minutes, passing_score, created_at, updated_at
		FROM question_sets
		WHERE id = $1
	`
	var s model.QuestionSet
	var desc *string
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&s.ID, &s.OrganizationID, &s.ProgramID, &s.Name, &desc,
		&s.Category, &s.DurationMinutes, &s.PassingScore, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrQuestionSetNotFound
		}
		return nil, fmt.Errorf("qset_repo: get by id: %w", err)
	}
	if desc != nil {
		s.Description = *desc
	}

	questions, err := r.ListQuestionsBySetID(ctx, id)
	if err != nil {
		return nil, err
	}
	s.Questions = questions
	s.TotalQuestions = len(questions)

	return &s, nil
}

func (r *QuestionSetRepository) Create(ctx context.Context, s *model.QuestionSet) (*model.QuestionSet, error) {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	if s.DurationMinutes <= 0 {
		s.DurationMinutes = 30
	}
	if s.PassingScore <= 0 {
		s.PassingScore = 70
	}
	if s.Category == "" {
		s.Category = "General Logic"
	}
	s.CreatedAt = time.Now()
	s.UpdatedAt = time.Now()

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.memSets[s.ID] = s
		r.memQuestions[s.ID] = s.Questions
		s.TotalQuestions = len(s.Questions)
		return s, nil
	}

	query := `
		INSERT INTO question_sets (
			id, organization_id, program_id, name, description,
			category, duration_minutes, passing_score, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, organization_id, program_id, name, description,
			category, duration_minutes, passing_score, created_at, updated_at
	`
	var desc *string
	if s.Description != "" {
		desc = &s.Description
	}
	err := r.pool.QueryRow(ctx, query,
		s.ID, s.OrganizationID, s.ProgramID, s.Name, desc,
		s.Category, s.DurationMinutes, s.PassingScore, s.CreatedAt, s.UpdatedAt,
	).Scan(
		&s.ID, &s.OrganizationID, &s.ProgramID, &s.Name, &desc,
		&s.Category, &s.DurationMinutes, &s.PassingScore, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("qset_repo: insert: %w", err)
	}
	if desc != nil {
		s.Description = *desc
	}

	if len(s.Questions) > 0 {
		saved, err := r.ReplaceQuestions(ctx, s.ID, s.ProgramID, s.Questions)
		if err == nil {
			s.Questions = saved
			s.TotalQuestions = len(saved)
		}
	}

	return s, nil
}

func (r *QuestionSetRepository) Update(ctx context.Context, s *model.QuestionSet) (*model.QuestionSet, error) {
	s.UpdatedAt = time.Now()

	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		existing, ok := r.memSets[s.ID]
		if !ok {
			return nil, ErrQuestionSetNotFound
		}
		existing.Name = s.Name
		existing.Description = s.Description
		existing.Category = s.Category
		existing.DurationMinutes = s.DurationMinutes
		existing.PassingScore = s.PassingScore
		existing.UpdatedAt = s.UpdatedAt
		if s.Questions != nil {
			r.memQuestions[s.ID] = s.Questions
			existing.Questions = s.Questions
			existing.TotalQuestions = len(s.Questions)
		}
		return existing, nil
	}

	query := `
		UPDATE question_sets
		SET name = $2, description = $3, category = $4, duration_minutes = $5,
			passing_score = $6, updated_at = now()
		WHERE id = $1
		RETURNING id, organization_id, program_id, name, description,
			category, duration_minutes, passing_score, created_at, updated_at
	`
	var desc *string
	if s.Description != "" {
		desc = &s.Description
	}
	err := r.pool.QueryRow(ctx, query,
		s.ID, s.Name, desc, s.Category, s.DurationMinutes, s.PassingScore,
	).Scan(
		&s.ID, &s.OrganizationID, &s.ProgramID, &s.Name, &desc,
		&s.Category, &s.DurationMinutes, &s.PassingScore, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("qset_repo: update: %w", err)
	}
	if desc != nil {
		s.Description = *desc
	}

	if s.Questions != nil {
		saved, err := r.ReplaceQuestions(ctx, s.ID, s.ProgramID, s.Questions)
		if err == nil {
			s.Questions = saved
			s.TotalQuestions = len(saved)
		}
	}

	return s, nil
}

func (r *QuestionSetRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		delete(r.memSets, id)
		delete(r.memQuestions, id)
		return nil
	}

	_, err := r.pool.Exec(ctx, `DELETE FROM question_sets WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("qset_repo: delete: %w", err)
	}
	return nil
}

func (r *QuestionSetRepository) Duplicate(ctx context.Context, id uuid.UUID) (*model.QuestionSet, error) {
	orig, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	newSet := &model.QuestionSet{
		ID:              uuid.New(),
		OrganizationID:  orig.OrganizationID,
		ProgramID:       orig.ProgramID,
		Name:            fmt.Sprintf("%s (Copy)", orig.Name),
		Description:     orig.Description,
		Category:        orig.Category,
		DurationMinutes: orig.DurationMinutes,
		PassingScore:    orig.PassingScore,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	var duplicatedQs []model.MCQQuestion
	for _, q := range orig.Questions {
		dupQ := q
		dupQ.ID = uuid.New()
		dupQ.QuestionSetID = &newSet.ID
		dupQ.CreatedAt = time.Now()
		dupQ.UpdatedAt = time.Now()
		duplicatedQs = append(duplicatedQs, dupQ)
	}
	newSet.Questions = duplicatedQs
	newSet.TotalQuestions = len(duplicatedQs)

	return r.Create(ctx, newSet)
}

func (r *QuestionSetRepository) ListQuestionsBySetID(ctx context.Context, setID uuid.UUID) ([]model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.RLock()
		defer r.mu.RUnlock()
		qs, ok := r.memQuestions[setID]
		if !ok {
			return []model.MCQQuestion{}, nil
		}
		return qs, nil
	}

	query := `
		SELECT id, program_id, question_set_id, category, question_text, options,
			correct_option_id, explanation, points, created_at, updated_at
		FROM mcq_questions
		WHERE question_set_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, setID)
	if err != nil {
		return nil, fmt.Errorf("qset_repo: list questions: %w", err)
	}
	defer rows.Close()

	var questions []model.MCQQuestion
	for rows.Next() {
		var q model.MCQQuestion
		var rawOptions []byte
		var corrOpt, expl *string
		err := rows.Scan(
			&q.ID, &q.ProgramID, &q.QuestionSetID, &q.Category, &q.QuestionText,
			&rawOptions, &corrOpt, &expl, &q.Points, &q.CreatedAt, &q.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("qset_repo: scan question: %w", err)
		}
		_ = json.Unmarshal(rawOptions, &q.Options)
		if corrOpt != nil {
			q.CorrectOptionID = *corrOpt
		}
		if expl != nil {
			q.Explanation = *expl
		}
		questions = append(questions, q)
	}
	return questions, nil
}

func (r *QuestionSetRepository) ReplaceQuestions(ctx context.Context, setID uuid.UUID, programID *uuid.UUID, questions []model.MCQQuestion) ([]model.MCQQuestion, error) {
	if r.pool == nil {
		r.mu.Lock()
		defer r.mu.Unlock()
		var saved []model.MCQQuestion
		for _, q := range questions {
			if q.ID == uuid.Nil {
				q.ID = uuid.New()
			}
			q.QuestionSetID = &setID
			if programID != nil {
				q.ProgramID = *programID
			}
			q.CreatedAt = time.Now()
			q.UpdatedAt = time.Now()
			saved = append(saved, q)
		}
		r.memQuestions[setID] = saved
		if s, ok := r.memSets[setID]; ok {
			s.Questions = saved
			s.TotalQuestions = len(saved)
		}
		return saved, nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("qset_repo: begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `DELETE FROM mcq_questions WHERE question_set_id = $1`, setID)
	if err != nil {
		return nil, fmt.Errorf("qset_repo: delete existing questions: %w", err)
	}

	progIDVal := r.defaultProgID
	if programID != nil && *programID != uuid.Nil {
		progIDVal = *programID
	}

	var saved []model.MCQQuestion
	for _, q := range questions {
		if q.ID == uuid.Nil {
			q.ID = uuid.New()
		}
		optionsJSON, err := json.Marshal(q.Options)
		if err != nil {
			return nil, fmt.Errorf("qset_repo: marshal options: %w", err)
		}
		query := `
			INSERT INTO mcq_questions (
				id, program_id, question_set_id, category, question_text, options,
				correct_option_id, explanation, points, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
			RETURNING id, program_id, question_set_id, category, question_text, options,
				correct_option_id, explanation, points, created_at, updated_at
		`
		var res model.MCQQuestion
		var rawOptions []byte
		err = tx.QueryRow(ctx, query,
			q.ID, progIDVal, setID, q.Category, q.QuestionText, optionsJSON,
			q.CorrectOptionID, q.Explanation, q.Points,
		).Scan(
			&res.ID, &res.ProgramID, &res.QuestionSetID, &res.Category, &res.QuestionText,
			&rawOptions, &res.CorrectOptionID, &res.Explanation, &res.Points,
			&res.CreatedAt, &res.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("qset_repo: insert question: %w", err)
		}
		_ = json.Unmarshal(rawOptions, &res.Options)
		saved = append(saved, res)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("qset_repo: commit tx: %w", err)
	}
	return saved, nil
}
