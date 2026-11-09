package handler_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/kulkul/backend/internal/auth"
	"github.com/kulkul/backend/internal/github"
	"github.com/kulkul/backend/internal/handler"
	"github.com/kulkul/backend/internal/middleware"
	"github.com/kulkul/backend/internal/model"
	"github.com/kulkul/backend/internal/repository"
	"github.com/kulkul/backend/pkg/storage"
)

func bookZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, _ := zw.Create(name)
		_, _ = w.Write([]byte(body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestImportCurriculumFromBook(t *testing.T) {
	ctx := context.Background()
	userRepo := repository.NewUserRepository(nil)
	orgRepo := repository.NewOrgRepository(nil)
	programRepo := repository.NewProgramRepository(nil)
	applicantRepo := repository.NewApplicantRepository(nil)
	mentorRepo := repository.NewMentorRepository(nil)
	org, _ := orgRepo.Register(ctx, "book-org", "Book Org", "admin@book.test", "", model.OrgStatusApproved)
	admin, _ := userRepo.Create(ctx, "admin@book.test", "hash", "Admin", model.RoleOrgAdmin, &org.ID)
	program, _ := programRepo.Create(ctx, &model.Program{OrganizationID: org.ID, Slug: "book", Name: "Book Program"})
	_, _, _ = applicantRepo.CreateOrGet(ctx, &model.Applicant{
		OrganizationID: org.ID, ProgramID: program.ID, Email: "fellow@book.test", FullName: "Fellow", CurrentStage: model.StageApprovedForLive,
	})

	store, err := storage.NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	// A fake GitHub serving the book as a zipball
	var served []byte
	gh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/acme/course/zipball/main" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(served)
	}))
	defer gh.Close()

	h := handler.NewRoomContentHandler(repository.NewRoomContentRepository(nil), programRepo, applicantRepo, mentorRepo,
		store, github.NewClient("").WithBaseURL(gh.URL))
	r := chi.NewRouter()
	r.Get("/programs/{programId}/room-content", h.GetContent)
	r.Put("/programs/{programId}/room-content/curriculum", h.SaveCurriculum)
	r.Post("/programs/{programId}/room-content/curriculum/import", h.ImportCurriculum)
	base := "/programs/" + program.ID.String() + "/room-content"
	adminClaims := &auth.Claims{UserID: admin.ID, Email: admin.Email, Role: admin.Role, OrganizationID: admin.OrganizationID}
	fellowClaims := &auth.Claims{Email: "fellow@book.test", Role: model.RoleCandidate}

	send := func(c *auth.Claims, req *http.Request) (int, model.ProgramRoomContent, map[string]any, string) {
		req = req.WithContext(middleware.WithUser(req.Context(), c))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var resp struct {
			Content model.ProgramRoomContent `json:"content"`
			Report  map[string]any           `json:"report"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return w.Code, resp.Content, resp.Report, w.Body.String()
	}
	upload := func(c *auth.Claims, data []byte) (int, model.ProgramRoomContent, map[string]any, string) {
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		fw, _ := mw.CreateFormFile("file", "course.zip")
		_, _ = fw.Write(data)
		_ = mw.Close()
		req := httptest.NewRequest(http.MethodPost, base+"/curriculum/import", &body)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		return send(c, req)
	}
	fromGitHub := func(repo string) (int, model.ProgramRoomContent, map[string]any, string) {
		req := httptest.NewRequest(http.MethodPost, base+"/curriculum/import", strings.NewReader(`{"repo":"`+repo+`"}`))
		req.Header.Set("Content-Type", "application/json")
		return send(adminClaims, req)
	}

	// A module written by hand before the first import, with the same title as chapter 1
	putReq := httptest.NewRequest(http.MethodPut, base+"/curriculum", strings.NewReader(
		`{"items":[{"title":"Session 1: Intro","description":"pasted","start_date":"2026-11-02"},{"title":"Kickoff call"}]}`))
	putReq.Header.Set("Content-Type", "application/json")
	if code, _, _, body := send(adminClaims, putReq); code != http.StatusOK {
		t.Fatalf("seed curriculum: %d %s", code, body)
	}

	book := map[string]string{
		"manuscript/Book.txt":              "01-intro.txt\n02-next.txt\n",
		"manuscript/01-intro.txt":          "{#intro}\n# Session 1: Intro\n\n![Map](map.png)\n\nT> Take notes.\n\n{quiz, id: q}\n? Pick one\n\na) no\nB) yes\n{/quiz}\n",
		"manuscript/02-next.txt":           "{#next}\n# Session 2: Next\n\nBack to [the intro](#intro).\n",
		"manuscript/resources/map.png":     "\x89PNG fake",
		"manuscript/resources/unused.webp": "x",
	}

	// Fellows cannot import
	if code, _, _, _ := upload(fellowClaims, bookZip(t, book)); code != http.StatusForbidden {
		t.Fatalf("expected fellows to be refused, got %d", code)
	}

	code, content, report, body := upload(adminClaims, bookZip(t, book))
	if code != http.StatusOK {
		t.Fatalf("import: %d %s", code, body)
	}
	cur := content.Curriculum
	if len(cur) != 3 || cur[0].Title != "Session 1: Intro" || cur[1].Title != "Session 2: Next" || cur[2].Title != "Kickoff call" {
		t.Fatalf("unexpected curriculum order: %+v", cur)
	}
	intro := cur[0]
	if intro.StartDate != "2026-11-02" || intro.Source != "#intro" || intro.SourceFile != "01-intro.txt" {
		t.Fatalf("the hand-written module should be adopted with its date kept: %+v", intro)
	}
	for _, want := range []string{"![Map](", "> **Tip**", "````markua-quiz\n? Pick one", "B) yes"} {
		if !strings.Contains(intro.Description, want) {
			t.Errorf("chapter 1 is missing %q:\n%s", want, intro.Description)
		}
	}
	if strings.Contains(intro.Description, "](map.png)") {
		t.Errorf("the image should point at storage: %s", intro.Description)
	}
	if !strings.Contains(cur[1].Description, "[the intro](#item-"+intro.ID+")") {
		t.Errorf("crosslink should go to the intro module: %s", cur[2].Description)
	}
	if report["added"] != 1.0 || report["updated"] != 1.0 || report["images"] != 1.0 {
		t.Errorf("unexpected report: %v", report)
	}
	if content.CurriculumSource == nil || content.CurriculumSource.Kind != "zip" || content.CurriculumSource.BookDir != "manuscript" {
		t.Errorf("unexpected source: %+v", content.CurriculumSource)
	}

	// Fellows see the modules but not where they came from
	getReq := httptest.NewRequest(http.MethodGet, base, nil)
	if code, shown, _, _ := send(fellowClaims, getReq); code != http.StatusOK || shown.CurriculumSource != nil || shown.Curriculum[0].Source != "" {
		t.Fatalf("fellow view: %d %+v", code, shown)
	}

	// Sync from GitHub (new chapters join the book's modules, before ones written by hand):
	// chapter 2 is gone, chapter 3 is new, chapter 1 is unchanged
	book["manuscript/Book.txt"] = "01-intro.txt\n03-last.txt\n"
	book["manuscript/03-last.txt"] = "# Session 3: Last\n\nDone.\n"
	delete(book, "manuscript/02-next.txt")
	wrapped := map[string]string{}
	for k, v := range book {
		wrapped["acme-course-1a2b3c4/"+k] = v
	}
	served = bookZip(t, wrapped)

	if code, _, _, body := fromGitHub("https://github.com/acme/missing"); code != http.StatusBadRequest || !strings.Contains(body, "not found") {
		t.Fatalf("expected a missing repository to be explained, got %d %s", code, body)
	}
	code, content, report, body = fromGitHub("https://github.com/acme/course/tree/main/manuscript")
	if code != http.StatusOK {
		t.Fatalf("github import: %d %s", code, body)
	}
	cur = content.Curriculum
	if len(cur) != 3 || cur[0].ID != intro.ID || cur[0].StartDate != "2026-11-02" || cur[1].Title != "Session 3: Last" || cur[2].Title != "Kickoff call" {
		t.Fatalf("unexpected synced curriculum: %+v", cur)
	}
	if report["unchanged"] != 1.0 || report["added"] != 1.0 || len(report["removed"].([]any)) != 1 {
		t.Errorf("unexpected sync report: %v", report)
	}
	src := content.CurriculumSource
	if src == nil || src.Kind != "github" || src.Repo != "acme/course" || src.Ref != "main" || src.Path != "manuscript" || src.Commit != "1a2b3c4" {
		t.Errorf("unexpected github source: %+v", src)
	}

	// Not a book
	if code, _, _, body := upload(adminClaims, bookZip(t, map[string]string{"README.md": "hi"})); code != http.StatusBadRequest || !strings.Contains(body, "Book.txt") {
		t.Fatalf("expected a zip without Book.txt to be refused, got %d %s", code, body)
	}
	if code, _, _, _ := upload(adminClaims, []byte("not a zip")); code != http.StatusBadRequest {
		t.Fatalf("expected a non-zip to be refused, got %d", code)
	}
}
