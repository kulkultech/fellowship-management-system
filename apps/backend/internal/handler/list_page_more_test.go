package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

type pagedBody struct {
	Total        int            `json:"total"`
	Page         int            `json:"page"`
	PageSize     int            `json:"page_size"`
	StatusCounts map[string]int `json:"status_counts"`
	Companies    []any          `json:"companies"`
	Submissions  []any          `json:"submissions"`
}

func getPaged(t *testing.T, r http.Handler, url string) pagedBody {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, url, nil)
	req = req.WithContext(middleware.WithUser(req.Context(), &auth.Claims{UserID: uuid.New(), Role: model.RoleSuperadmin}))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("%s: status %d: %s", url, rec.Code, rec.Body.String())
	}
	var body pagedBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func TestListCompaniesPaged(t *testing.T) {
	ctx := context.Background()
	orgRepo := repository.NewOrgRepository(nil)
	h := handler.NewAdminHandler(
		repository.NewApplicantRepository(nil), repository.NewSubmissionRepository(nil),
		repository.NewMCQRepository(nil), repository.NewQuestionSetRepository(nil),
		repository.NewTrackRepository(nil), repository.NewAIInterviewRepository(nil),
		repository.NewProgramRepository(nil), orgRepo, repository.NewUserRepository(nil),
		nil, "https://example.test",
	)
	for i := 0; i < 5; i++ {
		status := model.OrgStatusApproved
		if i < 2 {
			status = model.OrgStatusPendingApproval
		}
		if _, err := orgRepo.Register(ctx, fmt.Sprintf("acme-%d", i), fmt.Sprintf("Acme %d", i), "", "", status); err != nil {
			t.Fatal(err)
		}
	}
	r := chi.NewRouter()
	r.Get("/admin/companies", h.ListCompanies)

	all := getPaged(t, r, "/admin/companies?page=2&page_size=2")
	if all.Total < 5 || len(all.Companies) != 2 || all.Page != 2 {
		t.Errorf("page 2 = %+v", all)
	}
	pending := getPaged(t, r, "/admin/companies?status=pending_approval&page=1&page_size=10")
	if pending.Total != 2 || pending.StatusCounts["pending_approval"] != 2 || pending.StatusCounts["approved"] < 3 {
		t.Errorf("pending = %+v", pending)
	}
	search := getPaged(t, r, "/admin/companies?q=ACME-3&page=1&page_size=10")
	if search.Total != 1 || len(search.Companies) != 1 {
		t.Errorf("search = %+v", search)
	}
}

func TestListSubmissionsPaged(t *testing.T) {
	ctx := context.Background()
	assignRepo := repository.NewAssignmentRepository(nil, repository.NewApplicantRepository(nil), repository.NewUserRepository(nil))
	h := handler.NewAssignmentHandler(assignRepo, repository.NewProgramRepository(nil),
		repository.NewApplicantRepository(nil), nil, repository.NewUserRepository(nil))
	programID, assignmentID := uuid.New(), uuid.New()
	for i := 0; i < 7; i++ {
		status := model.AssignmentSubmissionSubmitted
		if i < 3 {
			status = model.AssignmentSubmissionGraded
		}
		if _, err := assignRepo.SubmitAssignment(ctx, &model.AssignmentSubmission{
			AssignmentID: assignmentID, ApplicantID: uuid.New(), Status: status,
		}); err != nil {
			t.Fatal(err)
		}
	}
	r := chi.NewRouter()
	r.Get("/programs/{programId}/assignments/{assignmentId}/submissions", h.ListSubmissions)
	base := fmt.Sprintf("/programs/%s/assignments/%s/submissions", programID, assignmentID)

	body := getPaged(t, r, base+"?page=2&page_size=5")
	if body.Total != 7 || len(body.Submissions) != 2 {
		t.Errorf("page 2 = %+v", body)
	}
	if body.StatusCounts["graded"] != 3 || body.StatusCounts["pending"] != 4 || body.StatusCounts["all"] != 7 {
		t.Errorf("counts = %v", body.StatusCounts)
	}
	pending := getPaged(t, r, base+"?status=pending&page=1&page_size=25")
	if pending.Total != 4 || pending.StatusCounts["all"] != 7 {
		t.Errorf("pending filter = %+v", pending)
	}
}
