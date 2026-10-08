package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/github"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
)

func newFakeGitHubAPI(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/Acme/App", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"full_name":"acme/app","name":"app","html_url":"https://github.com/acme/app","owner":{"login":"acme"}}`)
	})
	mux.HandleFunc("/repos/acme/app/pulls", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"user":{"login":"GraceH","type":"User"},"merged_at":"2026-09-01T00:00:00Z"},{"user":{"login":"outsider","type":"User"},"merged_at":null}]`)
	})
	mux.HandleFunc("/repos/acme/app/issues", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"number":1,"user":{"login":"graceh","type":"User"},"pull_request":{}},{"number":2,"user":{"login":"graceh","type":"User"}}]`)
	})
	mux.HandleFunc("/repos/acme/app/issues/comments", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"user":{"login":"graceh","type":"User"},"issue_url":"https://api.github.com/repos/acme/app/issues/1"}]`)
	})
	mux.HandleFunc("/repos/acme/app/pulls/comments", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[]`)
	})
	mux.HandleFunc("/repos/acme/app/commits", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"author":{"login":"graceh","type":"User"}},{"author":{"login":"graceh","type":"User"}},{"author":{"login":"graceh","type":"User"}}]`)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestGitHubContributionTracking(t *testing.T) {
	ctx := context.Background()
	appRepo := repository.NewApplicantRepository(nil)
	progRepo := repository.NewProgramRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	githubRepo := repository.NewGitHubRepository(nil)
	srv := newFakeGitHubAPI(t)

	h := handler.NewGitHubHandler(githubRepo, progRepo, appRepo, mentorRepo, github.NewClient("").WithBaseURL(srv.URL))
	handler.SetGitHubSyncRunner(h, func(f func()) { f() })

	org, err := orgRepo.Create(ctx, "kulkul-gh", "KulKul Tech", "")
	if err != nil {
		t.Fatalf("failed to create org: %v", err)
	}
	progID := uuid.New()
	_, _ = progRepo.Create(ctx, &model.Program{ID: progID, OrganizationID: org.ID, Slug: "gh-2026", Name: "GH Fellowship"})

	seed := func(name, email, githubURL string, stage model.ApplicantStage) {
		if _, _, err := appRepo.CreateOrGet(ctx, &model.Applicant{
			ID: uuid.New(), OrganizationID: org.ID, ProgramID: progID,
			Email: email, FullName: name, GitHubURL: githubURL, CurrentStage: stage,
		}); err != nil {
			t.Fatalf("failed to create applicant: %v", err)
		}
	}
	seed("Grace Hopper", "grace@example.com", "https://github.com/GraceH", model.StageApprovedForLive)
	seed("Alan Turing", "alan@example.com", "", model.StageCompleted)
	seed("Pending Applicant", "pending@example.com", "https://github.com/outsider", model.StageRegistered)

	router := chi.NewRouter()
	router.Route("/programs/{programId}/github", func(g chi.Router) {
		g.Get("/repos", h.ListRepos)
		g.Post("/repos", h.AddRepo)
		g.Delete("/repos/{repoId}", h.DeleteRepo)
		g.Post("/repos/{repoId}/sync", h.SyncRepo)
		g.Get("/activity", h.GetActivity)
	})
	adminClaims := &auth.Claims{UserID: uuid.New(), Email: "admin@kulkul.org", Role: "org_admin", OrganizationID: &org.ID}
	do := func(claims *auth.Claims, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(middleware.WithUser(req.Context(), claims))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	base := fmt.Sprintf("/programs/%s/github", progID)

	// Add a repository (the URL casing differs from GitHub's canonical name)
	w := do(adminClaims, "POST", base+"/repos", `{"repo_url":"https://github.com/Acme/App"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 adding repo, got %d: %s", w.Code, w.Body.String())
	}
	var repo model.ProgramGitHubRepo
	_ = json.Unmarshal(w.Body.Bytes(), &repo)
	if repo.FullName != "acme/app" || repo.SyncStatus != model.GitHubSyncSuccess || repo.LastSyncedAt == nil {
		t.Fatalf("expected synced acme/app, got %+v", repo)
	}

	// Duplicate repositories are rejected
	if w := do(adminClaims, "POST", base+"/repos", `{"repo_url":"acme/app"}`); w.Code != http.StatusBadRequest && w.Code != http.StatusConflict {
		t.Errorf("expected duplicate repo to be rejected, got %d", w.Code)
	}

	// Activity maps contributions to fellows only, matching logins case-insensitively
	w = do(adminClaims, "GET", base+"/activity", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for activity, got %d: %s", w.Code, w.Body.String())
	}
	var activity struct {
		Fellows []model.GitHubFellowActivity `json:"fellows"`
		Repos   []model.ProgramGitHubRepo    `json:"repos"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &activity)
	if len(activity.Fellows) != 2 || len(activity.Repos) != 1 {
		t.Fatalf("expected 2 fellows and 1 repo, got %d fellows, %d repos", len(activity.Fellows), len(activity.Repos))
	}
	alan, grace := activity.Fellows[0], activity.Fellows[1]
	want := model.GitHubContributionCounts{Commits: 3, PullRequests: 1, PullRequestsMerged: 1, Issues: 1, PRComments: 1}
	if grace.GitHubLogin != "GraceH" || grace.Totals != want || grace.ByRepo[repo.ID.String()] != want {
		t.Errorf("unexpected Grace activity: %+v", grace)
	}
	if alan.GitHubLogin != "" || alan.Totals != (model.GitHubContributionCounts{}) {
		t.Errorf("expected no activity for fellow without GitHub, got %+v", alan)
	}

	// Mentors need to be assigned to the program; other organizations are rejected
	mentorClaims := &auth.Claims{UserID: uuid.New(), Email: "mentor@kulkul.org", Role: "mentor"}
	if w := do(mentorClaims, "GET", base+"/activity", ""); w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for unassigned mentor, got %d", w.Code)
	}
	if _, err := mentorRepo.AssignMentor(ctx, progID, mentorClaims.UserID, "Mentor", ""); err != nil {
		t.Fatalf("failed to assign mentor: %v", err)
	}
	if w := do(mentorClaims, "GET", base+"/activity", ""); w.Code != http.StatusOK {
		t.Errorf("expected 200 for assigned mentor, got %d", w.Code)
	}
	otherOrg := uuid.New()
	otherAdmin := &auth.Claims{UserID: uuid.New(), Email: "x@other.org", Role: "org_admin", OrganizationID: &otherOrg}
	if w := do(otherAdmin, "GET", base+"/activity", ""); w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for another organization's admin, got %d", w.Code)
	}

	// A failed sync keeps the previous counts and records the error
	srv.Close()
	w = do(adminClaims, "POST", fmt.Sprintf("%s/repos/%s/sync", base, repo.ID), "")
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 for sync, got %d", w.Code)
	}
	failed, _ := githubRepo.GetByID(ctx, repo.ID)
	if failed.SyncStatus != model.GitHubSyncError || failed.SyncError == "" || failed.Contributions["graceh"].Commits != 3 {
		t.Errorf("expected error status with previous counts kept, got %+v", failed)
	}

	// Removing the repository
	if w := do(adminClaims, "DELETE", fmt.Sprintf("%s/repos/%s", base, repo.ID), ""); w.Code != http.StatusNoContent {
		t.Errorf("expected 204 removing repo, got %d", w.Code)
	}
	if repos, _ := githubRepo.ListByProgram(ctx, progID); len(repos) != 0 {
		t.Errorf("expected no repos after removal, got %d", len(repos))
	}
}

func TestGitHubSyncSkipsWhenAlreadyRunning(t *testing.T) {
	ctx := context.Background()
	githubRepo := repository.NewGitHubRepository(nil)
	repo, _ := githubRepo.Create(ctx, &model.ProgramGitHubRepo{ProgramID: uuid.New(), Owner: "acme", Name: "app", FullName: "acme/app"})

	if started, _ := githubRepo.TryStartSync(ctx, repo.ID, time.Minute); !started {
		t.Fatalf("expected first sync to start")
	}
	if started, _ := githubRepo.TryStartSync(ctx, repo.ID, time.Minute); started {
		t.Errorf("expected second sync to be skipped while the first is running")
	}
	if started, _ := githubRepo.TryStartSync(ctx, repo.ID, 0); !started {
		t.Errorf("expected a stale sync to be restartable")
	}
}
