package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestAssignmentLifecycle_EndToEnd(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	assignmentRepo := repository.NewAssignmentRepository(nil, applicantRepo, userRepo)

	// 1. Setup Org & Program
	org, err := orgRepo.Register(ctx, "acme-assignments", "Acme Assignments", "contact@acme.org", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	prog, err := programRepo.Create(ctx, &model.Program{
		OrganizationID: org.ID,
		Slug:           "lit-2026",
		Name:           "LIT 2026 Fellowship",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// 2. Setup Mentor
	mentorUser, err := userRepo.Create(ctx, "mentor@acme.org", "passhash", "Mentor Bob", model.RoleMentor, &org.ID)
	if err != nil {
		t.Fatalf("failed to create mentor: %v", err)
	}
	_, err = mentorRepo.AssignMentor(ctx, prog.ID, mentorUser.ID, "Lead Systems Mentor", "Bio")
	if err != nil {
		t.Fatalf("failed to assign mentor: %v", err)
	}

	// 3. Setup Fellow / Candidate
	fellowUser, err := userRepo.Create(ctx, "fellow@example.com", "passhash", "Fellow Alice", model.RoleCandidate, nil)
	if err != nil {
		t.Fatalf("failed to create fellow user: %v", err)
	}
	now := time.Now()
	applicant, _, err := applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID:       org.ID,
		ProgramID:            prog.ID,
		Email:                fellowUser.Email,
		FullName:             fellowUser.Name,
		CurrentStage:         model.StageApprovedForLive,
		ProgramRoomInvitedAt: &now,
	})
	if err != nil {
		t.Fatalf("failed to create applicant: %v", err)
	}

	// Handlers and Router
	assignmentHandler := handler.NewAssignmentHandler(assignmentRepo, programRepo, applicantRepo, mentorRepo, userRepo)

	r := chi.NewRouter()
	r.Route("/api/v1/programs/{programId}/assignments", func(a chi.Router) {
		a.Get("/", assignmentHandler.ListAssignments)
		a.Post("/", assignmentHandler.CreateAssignment)
		a.Get("/{assignmentId}", assignmentHandler.GetAssignment)
		a.Put("/{assignmentId}", assignmentHandler.UpdateAssignment)
		a.Delete("/{assignmentId}", assignmentHandler.DeleteAssignment)
		a.Get("/{assignmentId}/submissions", assignmentHandler.ListSubmissions)
		a.Post("/{assignmentId}/submit", assignmentHandler.SubmitAssignment)
		a.Post("/{assignmentId}/submissions/{submissionId}/grade", assignmentHandler.GradeSubmission)
	})

	mentorClaims := &auth.Claims{
		UserID:         mentorUser.ID,
		Email:          mentorUser.Email,
		Role:           mentorUser.Role,
		OrganizationID: &org.ID,
	}
	fellowClaims := &auth.Claims{
		UserID: fellowUser.ID,
		Email:  fellowUser.Email,
		Role:   fellowUser.Role,
	}

	// =========================================================================
	// Step 1: Mentor creates an assignment with due date & attachment
	// =========================================================================
	dueDateStr := time.Now().Add(7 * 24 * time.Hour).Format(time.RFC3339)
	createPayload := map[string]any{
		"title":           "Sprint 1: Concurrency Pipeline in Go",
		"description":     "Implement a multi-worker pipeline with graceful shutdown.",
		"due_date":        dueDateStr,
		"max_score":       100,
		"attachment_url":  "https://r2.fellowhire.com/attachments/starter.zip",
		"attachment_name": "starter.zip",
		"status":          "published",
	}
	body, _ := json.Marshal(createPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+prog.ID.String()+"/assignments", bytes.NewReader(body))
	req = req.WithContext(middleware.WithUser(req.Context(), mentorClaims))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on assignment create, got %d: %s", rec.Code, rec.Body.String())
	}

	var createdAssignment model.ProgramAssignment
	if err := json.Unmarshal(rec.Body.Bytes(), &createdAssignment); err != nil {
		t.Fatalf("unmarshal created assignment: %v", err)
	}
	if createdAssignment.Title != "Sprint 1: Concurrency Pipeline in Go" {
		t.Errorf("unexpected title: %s", createdAssignment.Title)
	}

	// =========================================================================
	// Step 2: Fellow lists assignments
	// =========================================================================
	req = httptest.NewRequest(http.MethodGet, "/api/v1/programs/"+prog.ID.String()+"/assignments", nil)
	req = req.WithContext(middleware.WithUser(req.Context(), fellowClaims))
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on fellow list assignments, got %d: %s", rec.Code, rec.Body.String())
	}
	var listResp struct {
		Assignments []*model.ProgramAssignment `json:"assignments"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("unmarshal list resp: %v", err)
	}
	if len(listResp.Assignments) != 1 {
		t.Fatalf("expected 1 assignment, got %d", len(listResp.Assignments))
	}
	if listResp.Assignments[0].MySubmission != nil {
		t.Errorf("expected no submission yet, got non-nil")
	}

	// =========================================================================
	// Step 3: Fellow submits assignment with uploaded file and repo link
	// =========================================================================
	submitPayload := map[string]any{
		"file_url":   "https://r2.fellowhire.com/assignments/alice-submission.zip",
		"file_name":  "alice-submission.zip",
		"file_size":  1048576,
		"github_url": "https://github.com/alice/concurrency-pipeline",
		"notes":      "Completed all bonus tasks with unit tests.",
	}
	body, _ = json.Marshal(submitPayload)
	req = httptest.NewRequest(
		http.MethodPost,
		"/api/v1/programs/"+prog.ID.String()+"/assignments/"+createdAssignment.ID.String()+"/submit",
		bytes.NewReader(body),
	)
	req = req.WithContext(middleware.WithUser(req.Context(), fellowClaims))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on submit assignment, got %d: %s", rec.Code, rec.Body.String())
	}

	var submitResp struct {
		Message    string                     `json:"message"`
		Submission model.AssignmentSubmission `json:"submission"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &submitResp); err != nil {
		t.Fatalf("unmarshal submit resp: %v", err)
	}
	if submitResp.Submission.Status != model.AssignmentSubmissionSubmitted {
		t.Errorf("expected status 'submitted', got %s", submitResp.Submission.Status)
	}
	if submitResp.Submission.ApplicantID != applicant.ID {
		t.Errorf("expected applicant id %s, got %s", applicant.ID, submitResp.Submission.ApplicantID)
	}

	// =========================================================================
	// Step 4: Fellow verifies assignment now contains MySubmission
	// =========================================================================
	req = httptest.NewRequest(http.MethodGet, "/api/v1/programs/"+prog.ID.String()+"/assignments", nil)
	req = req.WithContext(middleware.WithUser(req.Context(), fellowClaims))
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	var listRespAfter struct {
		Assignments []*model.ProgramAssignment `json:"assignments"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &listRespAfter)
	if listRespAfter.Assignments[0].MySubmission == nil {
		t.Fatalf("expected MySubmission to be populated after submitting")
	}
	if listRespAfter.Assignments[0].MySubmission.FileName != "alice-submission.zip" {
		t.Errorf("unexpected file name: %s", listRespAfter.Assignments[0].MySubmission.FileName)
	}

	// =========================================================================
	// Step 5: Mentor lists submissions for the assignment
	// =========================================================================
	req = httptest.NewRequest(
		http.MethodGet,
		"/api/v1/programs/"+prog.ID.String()+"/assignments/"+createdAssignment.ID.String()+"/submissions",
		nil,
	)
	req = req.WithContext(middleware.WithUser(req.Context(), mentorClaims))
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on mentor list submissions, got %d: %s", rec.Code, rec.Body.String())
	}
	var subsResp struct {
		Submissions []*model.AssignmentSubmission `json:"submissions"`
		Count       int                           `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &subsResp); err != nil {
		t.Fatalf("unmarshal subs resp: %v", err)
	}
	if len(subsResp.Submissions) != 1 {
		t.Fatalf("expected 1 submission, got %d", len(subsResp.Submissions))
	}
	subID := subsResp.Submissions[0].ID

	// =========================================================================
	// Step 6: Mentor grades the submission
	// =========================================================================
	gradePayload := map[string]any{
		"score":    96.5,
		"feedback": "Outstanding pipeline architecture and cleanly designed channel synchronization!",
	}
	body, _ = json.Marshal(gradePayload)
	req = httptest.NewRequest(
		http.MethodPost,
		"/api/v1/programs/"+prog.ID.String()+"/assignments/"+createdAssignment.ID.String()+"/submissions/"+subID.String()+"/grade",
		bytes.NewReader(body),
	)
	req = req.WithContext(middleware.WithUser(req.Context(), mentorClaims))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on grade submission, got %d: %s", rec.Code, rec.Body.String())
	}

	var gradeResp struct {
		Message    string                     `json:"message"`
		Submission model.AssignmentSubmission `json:"submission"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &gradeResp); err != nil {
		t.Fatalf("unmarshal grade resp: %v", err)
	}
	if gradeResp.Submission.Status != model.AssignmentSubmissionGraded {
		t.Errorf("expected status 'graded', got %s", gradeResp.Submission.Status)
	}
	if gradeResp.Submission.Score == nil || *gradeResp.Submission.Score != 96.5 {
		t.Errorf("expected score 96.5, got %v", gradeResp.Submission.Score)
	}
	if gradeResp.Submission.Feedback != "Outstanding pipeline architecture and cleanly designed channel synchronization!" {
		t.Errorf("unexpected feedback: %s", gradeResp.Submission.Feedback)
	}
}

func TestAssignmentPermissions_CandidateCannotCreateOrGrade(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	assignmentRepo := repository.NewAssignmentRepository(nil, applicantRepo, userRepo)

	org, _ := orgRepo.Register(ctx, "acme-test-org", "Acme", "test@acme.org", "", model.OrgStatusApproved)
	prog, _ := programRepo.Create(ctx, &model.Program{
		OrganizationID: org.ID,
		Slug:           "lit-2026",
		Name:           "LIT 2026",
	})
	fellowUser, _ := userRepo.Create(ctx, "fellow2@example.com", "passhash", "Fellow 2", model.RoleCandidate, nil)
	fellowClaims := &auth.Claims{
		UserID: fellowUser.ID,
		Email:  fellowUser.Email,
		Role:   fellowUser.Role,
	}

	assignmentHandler := handler.NewAssignmentHandler(assignmentRepo, programRepo, applicantRepo, mentorRepo, userRepo)
	r := chi.NewRouter()
	r.Route("/api/v1/programs/{programId}/assignments", func(a chi.Router) {
		a.Post("/", assignmentHandler.CreateAssignment)
		a.Post("/{assignmentId}/submissions/{submissionId}/grade", assignmentHandler.GradeSubmission)
	})

	// Candidate tries to create assignment -> 403 Forbidden
	body, _ := json.Marshal(map[string]any{"title": "Hacked Assignment"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+prog.ID.String()+"/assignments", bytes.NewReader(body))
	req = req.WithContext(middleware.WithUser(req.Context(), fellowClaims))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for candidate creating assignment, got %d", rec.Code)
	}

	// Candidate tries to grade -> 403 Forbidden
	fakeID := uuid.New()
	req = httptest.NewRequest(
		http.MethodPost,
		"/api/v1/programs/"+prog.ID.String()+"/assignments/"+fakeID.String()+"/submissions/"+fakeID.String()+"/grade",
		bytes.NewReader(body),
	)
	req = req.WithContext(middleware.WithUser(req.Context(), fellowClaims))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for candidate grading assignment, got %d", rec.Code)
	}
}
