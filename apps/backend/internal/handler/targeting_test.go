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
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestStudentTargeting_AssignmentsAndSessions(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	assignmentRepo := repository.NewAssignmentRepository(nil, applicantRepo, userRepo)
	sessionRepo := repository.NewSessionRepository(nil, applicantRepo)

	// 1. Setup Org & Program
	org, err := orgRepo.Register(ctx, "target-org", "Target Org", "contact@target.org", "", model.OrgStatusApproved)
	if err != nil {
		t.Fatalf("failed to register org: %v", err)
	}

	prog, err := programRepo.Create(ctx, &model.Program{
		OrganizationID: org.ID,
		Slug:           "targeting-cohort-2026",
		Name:           "Targeting Cohort 2026",
	})
	if err != nil {
		t.Fatalf("failed to create program: %v", err)
	}

	// 2. Setup Mentor
	mentorUser, err := userRepo.Create(ctx, "mentor@target.org", "passhash", "Mentor Bob", model.RoleMentor, &org.ID)
	if err != nil {
		t.Fatalf("failed to create mentor: %v", err)
	}
	_, err = mentorRepo.AssignMentor(ctx, prog.ID, mentorUser.ID, "Lead Mentor", "Bio")
	if err != nil {
		t.Fatalf("failed to assign mentor: %v", err)
	}

	// 3. Setup Student A and Student B
	fellowUserA, _ := userRepo.Create(ctx, "student_a@target.com", "passhash", "Student A (Group 1)", model.RoleCandidate, nil)
	fellowUserB, _ := userRepo.Create(ctx, "student_b@target.com", "passhash", "Student B (Group 2)", model.RoleCandidate, nil)

	now := time.Now()
	studentA, _, err := applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID:       org.ID,
		ProgramID:            prog.ID,
		Email:                fellowUserA.Email,
		FullName:             fellowUserA.Name,
		CurrentStage:         model.StageApprovedForLive,
		ProgramRoomInvitedAt: &now,
	})
	if err != nil {
		t.Fatalf("failed to create applicant A: %v", err)
	}

	studentB, _, err := applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID:       org.ID,
		ProgramID:            prog.ID,
		Email:                fellowUserB.Email,
		FullName:             fellowUserB.Name,
		CurrentStage:         model.StageApprovedForLive,
		ProgramRoomInvitedAt: &now,
	})
	if err != nil {
		t.Fatalf("failed to create applicant B: %v", err)
	}

	mentorClaims := &auth.Claims{
		UserID: mentorUser.ID,
		Email:  mentorUser.Email,
		Role:   model.RoleMentor,
	}
	studentAClaims := &auth.Claims{
		UserID: fellowUserA.ID,
		Email:  studentA.Email,
		Role:   model.RoleCandidate,
	}
	studentBClaims := &auth.Claims{
		UserID: fellowUserB.ID,
		Email:  studentB.Email,
		Role:   model.RoleCandidate,
	}

	// Setup Router
	assignmentHandler := handler.NewAssignmentHandler(assignmentRepo, programRepo, applicantRepo, mentorRepo, userRepo)
	sessionHandler := handler.NewSessionHandler(sessionRepo, programRepo, applicantRepo, mentorRepo, userRepo)

	r := chi.NewRouter()
	r.Route("/api/v1/programs/{programId}", func(p chi.Router) {
		p.Route("/assignments", func(a chi.Router) {
			a.Get("/", assignmentHandler.ListAssignments)
			a.Post("/", assignmentHandler.CreateAssignment)
			a.Get("/{assignmentId}", assignmentHandler.GetAssignment)
			a.Put("/{assignmentId}", assignmentHandler.UpdateAssignment)
			a.Post("/{assignmentId}/submit", assignmentHandler.SubmitAssignment)
		})
		p.Route("/sessions", func(s chi.Router) {
			s.Get("/", sessionHandler.ListSessions)
			s.Post("/", sessionHandler.CreateSession)
			s.Get("/{sessionId}", sessionHandler.GetSession)
			s.Put("/{sessionId}", sessionHandler.UpdateSession)
			s.Post("/{sessionId}/check-in", sessionHandler.FellowCheckIn)
		})
	})

	// 4. Mentor creates a targeted assignment specifically for Student A
	createAssignPayload := map[string]any{
		"title":                "Group 1 Architecture Deep Dive",
		"description":          "Assignment exclusively for Student A",
		"max_score":            100,
		"target_applicant_ids": []string{studentA.ID.String()},
	}
	body, _ := json.Marshal(createAssignPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+prog.ID.String()+"/assignments", bytes.NewReader(body))
	req = req.WithContext(middleware.WithUser(req.Context(), mentorClaims))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}
	var createdAssignment model.ProgramAssignment
	_ = json.Unmarshal(rec.Body.Bytes(), &createdAssignment)

	if len(createdAssignment.TargetApplicantIDs) != 1 || createdAssignment.TargetApplicantIDs[0] != studentA.ID {
		t.Fatalf("expected TargetApplicantIDs to contain studentA ID, got: %v", createdAssignment.TargetApplicantIDs)
	}

	// 5. Student A lists assignments -> should SEE the assignment
	reqA := httptest.NewRequest(http.MethodGet, "/api/v1/programs/"+prog.ID.String()+"/assignments", nil)
	reqA = reqA.WithContext(middleware.WithUser(reqA.Context(), studentAClaims))
	recA := httptest.NewRecorder()
	r.ServeHTTP(recA, reqA)

	if recA.Code != http.StatusOK {
		t.Fatalf("student A list failed: %d: %s", recA.Code, recA.Body.String())
	}
	var respA map[string]any
	_ = json.Unmarshal(recA.Body.Bytes(), &respA)
	if int(respA["count"].(float64)) != 1 {
		t.Fatalf("expected student A to see 1 assignment, got %v", respA["count"])
	}

	// 6. Student B lists assignments -> should NOT SEE the targeted assignment
	reqB := httptest.NewRequest(http.MethodGet, "/api/v1/programs/"+prog.ID.String()+"/assignments", nil)
	reqB = reqB.WithContext(middleware.WithUser(reqB.Context(), studentBClaims))
	recB := httptest.NewRecorder()
	r.ServeHTTP(recB, reqB)

	if recB.Code != http.StatusOK {
		t.Fatalf("student B list failed: %d: %s", recB.Code, recB.Body.String())
	}
	var respB map[string]any
	_ = json.Unmarshal(recB.Body.Bytes(), &respB)
	if int(respB["count"].(float64)) != 0 {
		t.Fatalf("expected student B to see 0 assignments, got %v", respB["count"])
	}

	// 7. Student B attempts to submit to Student A's targeted assignment -> should receive 403 Forbidden
	submitPayload := map[string]any{
		"notes": "Student B trying to submit to Group 1 assignment",
	}
	submitBody, _ := json.Marshal(submitPayload)
	submitReqB := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+prog.ID.String()+"/assignments/"+createdAssignment.ID.String()+"/submit", bytes.NewReader(submitBody))
	submitReqB = submitReqB.WithContext(middleware.WithUser(submitReqB.Context(), studentBClaims))
	submitRecB := httptest.NewRecorder()
	r.ServeHTTP(submitRecB, submitReqB)

	if submitRecB.Code != http.StatusForbidden {
		t.Fatalf("expected Student B submission to return 403 Forbidden, got %d: %s", submitRecB.Code, submitRecB.Body.String())
	}

	// 8. Student A submits to targeted assignment -> succeeds (201 Created)
	submitReqA := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+prog.ID.String()+"/assignments/"+createdAssignment.ID.String()+"/submit", bytes.NewReader(submitBody))
	submitReqA = submitReqA.WithContext(middleware.WithUser(submitReqA.Context(), studentAClaims))
	submitRecA := httptest.NewRecorder()
	r.ServeHTTP(submitRecA, submitReqA)

	if submitRecA.Code != http.StatusOK {
		t.Fatalf("expected Student A submission to return 200 OK, got %d: %s", submitRecA.Code, submitRecA.Body.String())
	}

	// 9. Mentor creates a 1-on-1 session specifically for Student A
	createSessionPayload := map[string]any{
		"title":                "1-on-1 Technical Mentorship with Student A",
		"session_type":         "1_on_1",
		"start_time":           now.Add(1 * time.Hour).Format(time.RFC3339),
		"end_time":             now.Add(2 * time.Hour).Format(time.RFC3339),
		"meeting_url":          "https://meet.google.com/abc-def-ghi",
		"target_applicant_ids": []string{studentA.ID.String()},
	}
	sessBody, _ := json.Marshal(createSessionPayload)
	sessReq := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+prog.ID.String()+"/sessions", bytes.NewReader(sessBody))
	sessReq = sessReq.WithContext(middleware.WithUser(sessReq.Context(), mentorClaims))
	sessRec := httptest.NewRecorder()
	r.ServeHTTP(sessRec, sessReq)

	if sessRec.Code != http.StatusCreated {
		t.Fatalf("expected session creation 201 Created, got %d: %s", sessRec.Code, sessRec.Body.String())
	}
	var createdSession model.ProgramSession
	_ = json.Unmarshal(sessRec.Body.Bytes(), &createdSession)

	// 10. Student A lists sessions -> sees 1-on-1 session
	sessListReqA := httptest.NewRequest(http.MethodGet, "/api/v1/programs/"+prog.ID.String()+"/sessions", nil)
	sessListReqA = sessListReqA.WithContext(middleware.WithUser(sessListReqA.Context(), studentAClaims))
	sessListRecA := httptest.NewRecorder()
	r.ServeHTTP(sessListRecA, sessListReqA)

	var sessRespA map[string]any
	_ = json.Unmarshal(sessListRecA.Body.Bytes(), &sessRespA)
	sessListA := sessRespA["sessions"].([]any)
	if len(sessListA) != 1 {
		t.Fatalf("expected student A to see 1 session, got %d", len(sessListA))
	}

	// 11. Student B lists sessions -> DOES NOT see 1-on-1 session
	sessListReqB := httptest.NewRequest(http.MethodGet, "/api/v1/programs/"+prog.ID.String()+"/sessions", nil)
	sessListReqB = sessListReqB.WithContext(middleware.WithUser(sessListReqB.Context(), studentBClaims))
	sessListRecB := httptest.NewRecorder()
	r.ServeHTTP(sessListRecB, sessListReqB)

	var sessRespB map[string]any
	_ = json.Unmarshal(sessListRecB.Body.Bytes(), &sessRespB)
	sessListB := sessRespB["sessions"].([]any)
	if len(sessListB) != 0 {
		t.Fatalf("expected student B to see 0 sessions, got %d", len(sessListB))
	}

	// 12. Student B attempts to check-in to Student A's 1-on-1 session -> 403 Forbidden
	checkInReqB := httptest.NewRequest(http.MethodPost, "/api/v1/programs/"+prog.ID.String()+"/sessions/"+createdSession.ID.String()+"/check-in", nil)
	checkInReqB = checkInReqB.WithContext(middleware.WithUser(checkInReqB.Context(), studentBClaims))
	checkInRecB := httptest.NewRecorder()
	r.ServeHTTP(checkInRecB, checkInReqB)

	if checkInRecB.Code != http.StatusForbidden {
		t.Fatalf("expected student B check-in to return 403 Forbidden, got %d: %s", checkInRecB.Code, checkInRecB.Body.String())
	}
}
