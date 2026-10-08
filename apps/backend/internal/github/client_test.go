package github

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newFakeGitHub(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	var srv *httptest.Server
	mux.HandleFunc("/repos/acme/app/pulls", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("page") == "2" {
			fmt.Fprint(w, `[{"user":{"login":"Ada","type":"User"},"merged_at":null}]`)
			return
		}
		// First page links to a second page
		w.Header().Set("Link", fmt.Sprintf(`<%s/repos/acme/app/pulls?state=all&per_page=100&page=2>; rel="next"`, srv.URL))
		fmt.Fprint(w, `[
			{"user":{"login":"ada","type":"User"},"merged_at":"2026-09-01T00:00:00Z"},
			{"user":{"login":"dependabot[bot]","type":"Bot"},"merged_at":null},
			{"user":{"login":"alan","type":"User"},"merged_at":null}
		]`)
	})
	mux.HandleFunc("/repos/acme/app/issues", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[
			{"number":1,"user":{"login":"ada","type":"User"},"pull_request":{"url":"x"}},
			{"number":2,"user":{"login":"alan","type":"User"}},
			{"number":3,"user":{"login":"alan","type":"User"}}
		]`)
	})
	mux.HandleFunc("/repos/acme/app/issues/comments", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[
			{"user":{"login":"alan","type":"User"},"issue_url":"https://api.github.com/repos/acme/app/issues/1"},
			{"user":{"login":"ada","type":"User"},"issue_url":"https://api.github.com/repos/acme/app/issues/2"}
		]`)
	})
	mux.HandleFunc("/repos/acme/app/pulls/comments", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"user":{"login":"alan","type":"User"}},{"user":{"login":"alan","type":"User"}}]`)
	})
	mux.HandleFunc("/repos/acme/app/commits", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"author":{"login":"ada","type":"User"}},{"author":null},{"author":{"login":"ada","type":"User"}}]`)
	})
	mux.HandleFunc("/repos/acme/limited/pulls", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", "1790000000")
		w.WriteHeader(http.StatusForbidden)
	})
	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestCollectRepoActivity(t *testing.T) {
	srv := newFakeGitHub(t)
	client := NewClient("").WithBaseURL(srv.URL)

	activity, err := client.CollectRepoActivity(context.Background(), "acme", "app")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ada := activity.Contributors["ada"]
	if ada == nil {
		t.Fatalf("expected stats for ada, got %v", activity.Contributors)
	}
	want := ContributionCounts{Commits: 2, PullRequests: 2, PullRequestsMerged: 1, IssueComments: 1}
	if *ada != want {
		t.Errorf("ada: got %+v, want %+v", *ada, want)
	}

	alan := activity.Contributors["alan"]
	want = ContributionCounts{PullRequests: 1, Issues: 2, PRComments: 1, ReviewComments: 2}
	if alan == nil || *alan != want {
		t.Errorf("alan: got %+v, want %+v", alan, want)
	}

	if _, ok := activity.Contributors["dependabot[bot]"]; ok {
		t.Errorf("expected bot accounts to be ignored")
	}
	if activity.Truncated {
		t.Errorf("expected activity not to be truncated")
	}
}

func TestCollectRepoActivityErrors(t *testing.T) {
	srv := newFakeGitHub(t)
	client := NewClient("").WithBaseURL(srv.URL)

	if _, err := client.CollectRepoActivity(context.Background(), "acme", "missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
	if _, err := client.CollectRepoActivity(context.Background(), "acme", "limited"); !errors.Is(err, ErrRateLimited) {
		t.Errorf("expected ErrRateLimited, got %v", err)
	}
}

func TestParseRepoRef(t *testing.T) {
	valid := map[string][2]string{
		"acme/app":                              {"acme", "app"},
		"https://github.com/acme/app":           {"acme", "app"},
		"https://github.com/acme/app.git":       {"acme", "app"},
		"github.com/acme/app/pulls?q=is%3Aopen": {"acme", "app"},
		"git@github.com:acme/my.repo.git":       {"acme", "my.repo"},
		" https://www.github.com/acme/app/ ":    {"acme", "app"},
	}
	for in, want := range valid {
		owner, name, err := ParseRepoRef(in)
		if err != nil || owner != want[0] || name != want[1] {
			t.Errorf("ParseRepoRef(%q) = %q, %q, %v; want %v", in, owner, name, err, want)
		}
	}
	for _, in := range []string{"", "acme", "https://github.com/acme", "acme/app name"} {
		if _, _, err := ParseRepoRef(in); err == nil {
			t.Errorf("ParseRepoRef(%q): expected error", in)
		}
	}
}

func TestUsernameFromProfile(t *testing.T) {
	cases := map[string]string{
		"https://github.com/grace-hopper":       "grace-hopper",
		"github.com/grace-hopper/":              "grace-hopper",
		"https://www.github.com/GraceH?tab=x":   "GraceH",
		"https://github.com/grace/some-repo":    "grace",
		"@grace":                                "grace",
		"grace":                                 "grace",
		"https://linkedin.com/in/grace":         "",
		"https://gitlab.com/grace":              "",
		"":                                      "",
		"https://github.com/not a valid handle": "",
	}
	for in, want := range cases {
		if got := UsernameFromProfile(in); got != want {
			t.Errorf("UsernameFromProfile(%q) = %q, want %q", in, got, want)
		}
	}
}
