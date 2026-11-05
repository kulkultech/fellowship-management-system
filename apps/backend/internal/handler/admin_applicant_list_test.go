package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func TestListApplicantsPaged(t *testing.T) {
	ctx := context.Background()
	orgRepo := repository.NewOrgRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	appRepo := repository.NewApplicantRepository(nil)
	subRepo := repository.NewSubmissionRepository(nil)
	h := handler.NewAdminHandler(appRepo, subRepo, repository.NewMCQRepository(nil), repository.NewQuestionSetRepository(nil),
		repository.NewTrackRepository(nil), repository.NewAIInterviewRepository(nil), progRepo, orgRepo,
		repository.NewUserRepository(nil), nil, "https://example.test")

	org, _ := orgRepo.Register(ctx, "org", "Org", "a@org.test", "", model.OrgStatusApproved)
	prog, _ := progRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "p", Name: "P", Status: "published",
		OpenDate: time.Now().Add(-time.Hour), EndDate: time.Now().Add(time.Hour)})

	// 12 candidates "Fellow 1".."Fellow 12"; the even ones are admitted, Fellow 3 answered "Rust".
	for i := 1; i <= 12; i++ {
		stage := model.StageRegistered
		if i%2 == 0 {
			stage = model.StageApprovedForLive
		}
		custom := map[string]interface{}{"favorite_language": "Go"}
		if i == 3 {
			custom["favorite_language"] = "Rust"
		}
		a, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{OrganizationID: org.ID, ProgramID: prog.ID,
			Email: "f" + itoa(i) + "@x.test", FullName: "Fellow " + itoa(i), CurrentStage: stage, CustomResponses: custom})
		if err != nil {
			t.Fatal(err)
		}
		if i == 5 {
			if _, err := subRepo.Create(ctx, a.ID, prog.ID, "tok"); err != nil {
				t.Fatal(err)
			}
		}
	}

	get := func(query string) map[string]any {
		t.Helper()
		rec := httptest.NewRecorder()
		h.ListApplicants(rec, httptest.NewRequest(http.MethodGet, "/admin/applicants?program_id="+prog.ID.String()+query, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status %d %s", query, rec.Code, rec.Body.String())
		}
		var body map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		return body
	}
	names := func(body map[string]any) []string {
		var out []string
		for _, a := range body["applicants"].([]any) {
			out = append(out, a.(map[string]any)["full_name"].(string))
		}
		return out
	}

	// Natural sort by name, page 2 of 5 per page
	body := get("&page=2&page_size=5&sort=candidate:asc")
	if got := names(body); len(got) != 5 || got[0] != "Fellow 6" || got[4] != "Fellow 10" {
		t.Errorf("page 2 sorted by name = %v", got)
	}
	if body["total"].(float64) != 12 || body["page"].(float64) != 2 {
		t.Errorf("meta = total %v page %v", body["total"], body["page"])
	}
	counts := body["stage_counts"].(map[string]any)
	if counts["all"].(float64) != 12 || counts["approved_for_live"].(float64) != 6 {
		t.Errorf("stage counts = %v", counts)
	}

	// Stage tab + descending sort
	body = get("&page=1&page_size=3&stage_group=approved_for_live&sort=candidate:desc")
	if got := names(body); body["total"].(float64) != 6 || got[0] != "Fellow 12" || got[2] != "Fellow 8" {
		t.Errorf("admitted, newest name first = %v (total %v)", got, body["total"])
	}

	// Search reaches application-form answers
	body = get("&page=1&page_size=10&q=rust")
	if got := names(body); len(got) != 1 || got[0] != "Fellow 3" {
		t.Errorf("search rust = %v", got)
	}

	// Without page params the full list comes back, as before
	if got := names(get("")); len(got) != 12 {
		t.Errorf("unpaged list has %d candidates", len(got))
	}
}

func itoa(i int) string { return strconv.Itoa(i) }
