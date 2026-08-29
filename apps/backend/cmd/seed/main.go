package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/config"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := repository.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database for seeding", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	orgRepo := repository.NewOrgRepository(pool)
	userRepo := repository.NewUserRepository(pool)
	programRepo := repository.NewProgramRepository(pool)
	mcqRepo := repository.NewMCQRepository(pool)

	logger.Info("Seeding initial assessment platform data...")

	// 1. Organization: RSA
	org, err := orgRepo.Create(ctx, "rsa", "Remote Skills Academy (RSA)", "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=128&h=128&fit=crop")
	if err != nil {
		logger.Error("failed to seed RSA organization", "error", err)
		os.Exit(1)
	}
	logger.Info("Seeded organization", "slug", org.Slug, "name", org.Name)

	// 2. Admin User
	adminPassHash, err := auth.HashPassword("admin123")
	if err != nil {
		logger.Error("failed to hash admin password", "error", err)
		os.Exit(1)
	}
	adminUser, err := userRepo.GetByEmail(ctx, "admin@rsa.org")
	if err != nil {
		adminUser, err = userRepo.Create(ctx, "admin@rsa.org", adminPassHash, "RSA Reviewer Admin", "org_admin", &org.ID)
		if err != nil {
			logger.Error("failed to seed admin user", "error", err)
			os.Exit(1)
		}
	}
	logger.Info("Seeded admin user", "email", adminUser.Email)

	// 3. Program: LIT 2026
	openDate := time.Now().Add(-24 * time.Hour)
	endDate := time.Now().Add(180 * 24 * time.Hour) // 6 months
	program, err := programRepo.Create(ctx, &model.Program{
		OrganizationID:           org.ID,
		Slug:                     "lit2026",
		Name:                     "LIT 2026 Fellowship & Assessment",
		Description:              "The flagship talent acceleration fellowship program by RSA and Kulkul Tech. Assessment tests include Timed Logic & MCQ followed by an interactive AI Technical Screen.",
		OpenDate:                 openDate,
		EndDate:                  endDate,
		LogicTestDurationMinutes: 30,
		LogicTestPassingScore:    70,
		AllowRetake:              false,
		Status:                   "published",
	})
	if err != nil {
		logger.Error("failed to seed LIT 2026 program", "error", err)
		os.Exit(1)
	}
	logger.Info("Seeded program", "slug", program.Slug, "name", program.Name)

	// 4. MCQ Question Bank (10 Curated Logic & Problem Solving Questions)
	existingMCQs, _ := mcqRepo.ListByProgram(ctx, program.ID)
	if len(existingMCQs) == 0 {
		questions := []model.MCQQuestion{
			{
				ProgramID:    program.ID,
				Category:     "Logic & Problem Solving",
				QuestionText: "In a microservice system, Service A sends requests to Service B. If Service B becomes sluggish or intermittently times out, which pattern prevents Service A's thread pool from exhausting resources?",
				Options: []model.MCQOption{
					{ID: "a", Text: "Saga Pattern"},
					{ID: "b", Text: "Circuit Breaker Pattern"},
					{ID: "c", Text: "Two-Phase Commit"},
					{ID: "d", Text: "Event Sourcing"},
				},
				CorrectOptionID: "b",
				Explanation:     "The Circuit Breaker pattern prevents an application from repeatedly trying to execute an operation that's likely to fail, shielding upstream resources.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Data Structures & Algorithms",
				QuestionText: "What is the average time complexity of searching for an element in a balanced Binary Search Tree (AVL or Red-Black Tree) containing N elements?",
				Options: []model.MCQOption{
					{ID: "a", Text: "O(1)"},
					{ID: "b", Text: "O(log N)"},
					{ID: "c", Text: "O(N)"},
					{ID: "d", Text: "O(N log N)"},
				},
				CorrectOptionID: "b",
				Explanation:     "A balanced BST maintains height proportional to log2(N), guaranteeing O(log N) lookup, insertion, and deletion times.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Concurrency & Systems",
				QuestionText: "When two goroutines/threads read and write to the same memory address without synchronization, what race condition hazard occurs?",
				Options: []model.MCQOption{
					{ID: "a", Text: "Data Race & Undefined Memory State"},
					{ID: "b", Text: "Automatic Garbage Collection Pause"},
					{ID: "c", Text: "Deterministic Deadlock"},
					{ID: "d", Text: "Thread Starvation Only"},
				},
				CorrectOptionID: "a",
				Explanation:     "Concurrent unsynchronized read-write access to shared memory results in a data race leading to memory corruption and unpredictable behavior.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Logic & Deductive Reasoning",
				QuestionText: "If all asynchronous HTTP calls return Promises, and all database transactions in our repository return Promises, which of the following is logically valid?",
				Options: []model.MCQOption{
					{ID: "a", Text: "All Promises are database transactions"},
					{ID: "b", Text: "Any non-Promise function is neither an async HTTP call nor a database transaction"},
					{ID: "c", Text: "All HTTP calls are database transactions"},
					{ID: "d", Text: "No HTTP calls can be chained"},
				},
				CorrectOptionID: "b",
				Explanation:     "By contraposition (If P -> Q, then not Q -> not P), if a function does not return a Promise, it cannot be an async HTTP call or DB transaction.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Database & Architecture",
				QuestionText: "Which database isolation level prevents dirty reads, non-repeatable reads, and phantom reads?",
				Options: []model.MCQOption{
					{ID: "a", Text: "Read Committed"},
					{ID: "b", Text: "Repeatable Read"},
					{ID: "c", Text: "Serializable"},
					{ID: "d", Text: "Read Uncommitted"},
				},
				CorrectOptionID: "c",
				Explanation:     "Serializable isolation offers the highest level of consistency by simulating sequential transaction execution.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Software Engineering Design",
				QuestionText: "In the Dependency Inversion Principle (DIP) of SOLID, what should high-level modules depend upon?",
				Options: []model.MCQOption{
					{ID: "a", Text: "Low-level concrete implementations"},
					{ID: "b", Text: "Abstractions / Interfaces"},
					{ID: "c", Text: "Global Singleton instances"},
					{ID: "d", Text: "Static helper functions"},
				},
				CorrectOptionID: "b",
				Explanation:     "DIP states that high-level modules should not depend on low-level modules; both should depend on abstractions.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Web Security",
				QuestionText: "Which cookie attribute prevents client-side JavaScript (e.g. `document.cookie`) from accessing sensitive session tokens, mitigating XSS token theft?",
				Options: []model.MCQOption{
					{ID: "a", Text: "SameSite=Strict"},
					{ID: "b", Text: "HttpOnly"},
					{ID: "c", Text: "Secure"},
					{ID: "d", Text: "Domain"},
				},
				CorrectOptionID: "b",
				Explanation:     "The HttpOnly flag directs browsers to block JavaScript access to the cookie, neutralizing XSS credential theft.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Logic & Problem Solving",
				QuestionText: "You have an array of integers where every element appears twice except for one unique element. What bitwise operation can find the unique element in O(N) time and O(1) space?",
				Options: []model.MCQOption{
					{ID: "a", Text: "Bitwise AND (&)"},
					{ID: "b", Text: "Bitwise XOR (^)"},
					{ID: "c", Text: "Bitwise OR (|)"},
					{ID: "d", Text: "Bitwise NOT (~)"},
				},
				CorrectOptionID: "b",
				Explanation:     "XOR has the properties: X ^ X = 0 and X ^ 0 = X. XORing all elements cancels duplicate pairs, leaving only the unique integer.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "System Performance",
				QuestionText: "Which HTTP header is utilized by web browsers to negotiate compressed transfer representations (e.g. gzip, br) from the origin server?",
				Options: []model.MCQOption{
					{ID: "a", Text: "Accept-Encoding"},
					{ID: "b", Text: "Content-Type"},
					{ID: "c", Text: "Cache-Control"},
					{ID: "d", Text: "Transfer-Encoding"},
				},
				CorrectOptionID: "a",
				Explanation:     "Browsers send `Accept-Encoding: gzip, br` to inform the server which compression algorithms they support.",
				Points:          10,
			},
			{
				ProgramID:    program.ID,
				Category:     "Logic & Architecture",
				QuestionText: "In an idempotent REST API design, which of the following HTTP methods MUST produce the same resource state regardless of how many times identical requests are executed?",
				Options: []model.MCQOption{
					{ID: "a", Text: "POST"},
					{ID: "b", Text: "PUT and DELETE"},
					{ID: "c", Text: "PATCH only"},
					{ID: "d", Text: "No HTTP methods are guaranteed idempotent"},
				},
				CorrectOptionID: "b",
				Explanation:     "PUT (replace state) and DELETE (remove resource) are idempotent by RFC specifications; repeating them leaves the system in the same final state.",
				Points:          10,
			},
		}

		for _, q := range questions {
			_, err := mcqRepo.Create(ctx, &q)
			if err != nil {
				logger.Error("failed to seed MCQ", "question", q.QuestionText, "error", err)
			}
		}
		logger.Info("Seeded 10 MCQ assessment questions")
	}

	logger.Info("Database seeding complete!")
}
