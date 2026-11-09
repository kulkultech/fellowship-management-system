package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kulkul/backend/internal/github"
	"github.com/kulkul/backend/internal/httpx"
	"github.com/kulkul/backend/internal/markua"
	"github.com/kulkul/backend/internal/model"
)

const (
	maxBookZipBytes   = 50 << 20
	maxBookImageBytes = 10 << 20
	maxBookImages     = 300
	maxBookImageTotal = 80 << 20
)

var bookImageTypes = map[string]string{
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
}

// curriculumImportReport tells the importer what changed.
type curriculumImportReport struct {
	Chapters  int      `json:"chapters"`
	Added     int      `json:"added"`
	Updated   int      `json:"updated"`
	Unchanged int      `json:"unchanged"`
	Removed   []string `json:"removed"`
	Images    int      `json:"images"`
	Warnings  []string `json:"warnings"`
}

// ImportCurriculum handles POST /api/v1/programs/{programId}/room-content/curriculum/import.
// It reads a Leanpub-style book (Book.txt listing Markua chapter files) from an uploaded zip
// (multipart field "file") or a GitHub repository (JSON {"repo": "...", "ref": "..."}) and makes
// each chapter a module. Modules from an earlier import are updated in place, keeping their dates
// and audience; modules written in FellowHire are left alone.
func (h *RoomContentHandler) ImportCurriculum(w http.ResponseWriter, r *http.Request) {
	program, claims, ok := h.loadProgram(w, r)
	if !ok {
		return
	}
	if !h.canEdit(r.Context(), claims, program) {
		httpx.Error(w, http.StatusForbidden, "only this program's admins and mentors can import the curriculum")
		return
	}

	data, source, status, err := h.readBookArchive(w, r)
	if err != nil {
		httpx.Error(w, status, err.Error())
		return
	}
	archive, err := markua.OpenZip(data)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if source.Kind == "github" {
		if top := archive.TopDir(); top != "" {
			// GitHub names the folder owner-repo-<short commit>
			source.Commit = top[strings.LastIndex(top, "-")+1:]
		}
	}
	dir, err := archive.FindBookDir(source.Path)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	book, err := archive.ReadBook(dir)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if top := archive.TopDir(); top != "" && source.Kind == "github" {
		source.BookDir = strings.TrimPrefix(strings.TrimPrefix(dir, top), "/")
	} else {
		source.BookDir = dir
	}

	current, err := h.contentRepo.Get(r.Context(), program.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load the curriculum")
		return
	}
	items, slots, report := mergeBookChapters(current.Curriculum, book.Chapters)
	report.Warnings = append(report.Warnings, book.Warnings...)
	if len(items) > maxRoomItems {
		httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("the curriculum would have %d modules; the limit is %d", len(items), maxRoomItems))
		return
	}

	anchors := map[string]string{}
	for i, ch := range book.Chapters {
		if ch.Anchor != "" {
			anchors[ch.Anchor] = items[slots[i]].ID
		}
	}
	images := &bookImages{h: h, r: r, archive: archive, dir: dir, programID: program.ID, urls: map[string]string{}}
	before := map[string]model.CurriculumItem{}
	for _, it := range current.Curriculum {
		before[it.ID] = it
	}
	for i, ch := range book.Chapters {
		ch := ch
		md := markua.ToMarkdown(ch.Body, markua.Links{
			Image: func(ref string) (string, bool) { return images.url(ch.File, ref) },
			Crosslink: func(id string) (string, bool) {
				if moduleID, ok := anchors[id]; ok {
					return "#item-" + moduleID, true
				}
				return "", false
			},
		})
		if len([]rune(md)) > maxModuleContent {
			httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("chapter %q (%s) is longer than 200,000 characters; split it into smaller chapters", ch.Title, ch.File))
			return
		}
		title := ch.Title
		if len([]rune(title)) > maxRoomTitle {
			title = string([]rune(title)[:maxRoomTitle])
		}
		item := &items[slots[i]]
		item.Title, item.Description = title, md
		if old, ok := before[item.ID]; ok {
			if old.Title == item.Title && old.Description == item.Description {
				report.Unchanged++
			} else {
				report.Updated++
			}
		} else {
			report.Added++
		}
	}
	report.Images = len(images.urls)
	report.Warnings = append(report.Warnings, images.warnings...)

	source.ImportedAt = time.Now().UTC()
	source.ImportedBy = &claims.UserID
	content, err := h.contentRepo.SaveImportedCurriculum(r.Context(), program.ID, claims.UserID, items, source)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save the imported curriculum")
		return
	}
	if report.Removed == nil {
		report.Removed = []string{}
	}
	if report.Warnings == nil {
		report.Warnings = []string{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"content": content, "report": report})
}

// readBookArchive returns the uploaded zip, or downloads the GitHub repository named in the body.
func (h *RoomContentHandler) readBookArchive(w http.ResponseWriter, r *http.Request) ([]byte, model.CurriculumSource, int, error) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxBookZipBytes+(1<<20))
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			return nil, model.CurriculumSource{}, http.StatusBadRequest, errors.New("upload a .zip of the book, up to 50 MB")
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			return nil, model.CurriculumSource{}, http.StatusBadRequest, errors.New("choose a .zip file to upload")
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, maxBookZipBytes+1))
		if err != nil || len(data) > maxBookZipBytes {
			return nil, model.CurriculumSource{}, http.StatusBadRequest, errors.New("the zip must be 50 MB or smaller")
		}
		return data, model.CurriculumSource{Kind: "zip", FileName: path.Base(header.Filename), Path: strings.TrimSpace(r.FormValue("path"))}, 0, nil
	}

	var req struct {
		Repo string `json:"repo"`
		Ref  string `json:"ref"`
		Path string `json:"path"`
	}
	if err := httpx.Decode(w, r, &req); err != nil {
		return nil, model.CurriculumSource{}, http.StatusBadRequest, err
	}
	owner, name, ref, dir, err := parseBookRepo(req.Repo, req.Ref, req.Path)
	if err != nil {
		return nil, model.CurriculumSource{}, http.StatusBadRequest, err
	}
	if h.github == nil {
		return nil, model.CurriculumSource{}, http.StatusServiceUnavailable, errors.New("importing from GitHub is not set up; upload a zip instead")
	}
	data, err := h.github.DownloadZipball(r.Context(), owner, name, ref, maxBookZipBytes)
	switch {
	case errors.Is(err, github.ErrNotFound):
		msg := fmt.Sprintf("%s/%s was not found", owner, name)
		if ref != "" {
			msg = fmt.Sprintf("%s/%s (branch %s) was not found", owner, name, ref)
		}
		return nil, model.CurriculumSource{}, http.StatusBadRequest, errors.New(msg + ". If the repository is private, give FellowHire's GitHub token read access to it, or upload a zip instead")
	case errors.Is(err, github.ErrTooLarge):
		return nil, model.CurriculumSource{}, http.StatusBadRequest, errors.New("the repository is larger than 50 MB; upload a zip of just the manuscript folder instead")
	case errors.Is(err, github.ErrRateLimited):
		return nil, model.CurriculumSource{}, http.StatusServiceUnavailable, errors.New("GitHub's rate limit was reached; try again later or upload a zip")
	case err != nil:
		return nil, model.CurriculumSource{}, http.StatusBadGateway, errors.New("could not download the repository from GitHub; try again or upload a zip")
	}
	return data, model.CurriculumSource{Kind: "github", Repo: owner + "/" + name, Ref: ref, Path: dir}, 0, nil
}

// parseBookRepo reads a repository given as owner/repo or a github.com URL, which may point at a
// branch and folder (github.com/owner/repo/tree/main/manuscript). ref and dir, when given, win.
func parseBookRepo(repo, ref, dir string) (owner, name, outRef, outDir string, err error) {
	owner, name, err = github.ParseRepoRef(repo)
	if err != nil {
		return "", "", "", "", err
	}
	s := strings.TrimSpace(repo)
	if i := strings.Index(s, owner+"/"+name); i >= 0 {
		rest := strings.Trim(strings.SplitN(strings.SplitN(s[i+len(owner)+1+len(name):], "?", 2)[0], "#", 2)[0], "/")
		parts := strings.Split(rest, "/")
		if len(parts) >= 2 && (parts[0] == "tree" || parts[0] == "blob") {
			outRef = parts[1]
			outDir = strings.Join(parts[2:], "/")
			if path.Base(outDir) == "Book.txt" {
				outDir = path.Dir(outDir)
			}
		}
	}
	if r := strings.TrimSpace(ref); r != "" {
		outRef = r
	}
	if d := strings.Trim(strings.TrimSpace(dir), "/"); d != "" {
		outDir = d
	}
	if strings.Contains(outRef, "..") || strings.ContainsAny(outRef, " \\") {
		return "", "", "", "", errors.New("invalid branch name")
	}
	return owner, name, outRef, strings.Trim(outDir, "/"), nil
}

// mergeBookChapters lays the book's chapters over the current curriculum. A chapter updates the
// module imported from it before (same Source), or on a first import a module written by hand with
// the same title, keeping its id, dates and audience. Modules imported before whose chapter is gone
// are removed; modules written in FellowHire stay where they are. Chapters keep the book's order.
// slots[i] is the index in items of chapter i.
func mergeBookChapters(current []model.CurriculumItem, chapters []markua.Chapter) (items []model.CurriculumItem, slots []int, report curriculumImportReport) {
	report.Chapters = len(chapters)
	taken := make([]bool, len(current))
	match := make([]int, len(chapters))
	bySource := map[string]int{}
	for j, it := range current {
		if it.Source != "" {
			if _, dup := bySource[it.Source]; !dup {
				bySource[it.Source] = j
			}
		}
	}
	for i, ch := range chapters {
		match[i] = -1
		if j, ok := bySource[ch.Key]; ok && !taken[j] {
			match[i], taken[j] = j, true
		}
	}
	for i, ch := range chapters {
		if match[i] >= 0 {
			continue
		}
		for j, it := range current {
			if !taken[j] && it.Source == "" && strings.EqualFold(strings.TrimSpace(it.Title), strings.TrimSpace(ch.Title)) {
				match[i], taken[j] = j, true
				break
			}
		}
	}

	// Walk the current list: imported modules leave a slot that the book's chapters fill in order
	var slotPositions []int
	for j, it := range current {
		switch {
		case taken[j]:
			slotPositions = append(slotPositions, len(items))
			items = append(items, model.CurriculumItem{})
		case it.Source != "":
			report.Removed = append(report.Removed, it.Title)
		default:
			items = append(items, it)
		}
	}
	insertAt := len(items)
	if n := len(slotPositions); n > 0 {
		insertAt = slotPositions[n-1] + 1
	}
	var extra []model.CurriculumItem
	slots = make([]int, len(chapters))
	for i, ch := range chapters {
		var it model.CurriculumItem
		if match[i] >= 0 {
			it = current[match[i]]
		} else {
			it = model.CurriculumItem{ID: uuid.NewString()}
		}
		it.Source, it.SourceFile = ch.Key, ch.File
		if i < len(slotPositions) {
			items[slotPositions[i]] = it
			slots[i] = slotPositions[i]
		} else {
			extra = append(extra, it)
			slots[i] = -1
		}
	}
	if len(extra) > 0 {
		items = append(items[:insertAt], append(extra, items[insertAt:]...)...)
		// Slots after the insertion point moved along
		for i := range slots {
			if slots[i] >= insertAt {
				slots[i] += len(extra)
			}
		}
		k := 0
		for i := range slots {
			if slots[i] == -1 {
				slots[i] = insertAt + k
				k++
			}
		}
	}
	return items, slots, report
}

// bookImages uploads the images chapters use, once each, and remembers their URLs.
type bookImages struct {
	h         *RoomContentHandler
	r         *http.Request
	archive   *markua.Archive
	dir       string
	programID uuid.UUID
	urls      map[string]string
	failed    map[string]bool
	total     int64
	warnings  []string
}

func (b *bookImages) url(chapterFile, ref string) (string, bool) {
	p, ok := b.archive.ResolveResource(b.dir, chapterFile, ref)
	if !ok {
		b.warn(fmt.Sprintf("%s uses image %s, which is not in the book's resources folder", chapterFile, ref))
		return "", false
	}
	if u, ok := b.urls[p]; ok {
		return u, true
	}
	if b.failed[p] {
		return "", false
	}
	fail := func(msg string) (string, bool) {
		b.warn(msg)
		if b.failed == nil {
			b.failed = map[string]bool{}
		}
		b.failed[p] = true
		return "", false
	}
	contentType, ok := bookImageTypes[strings.ToLower(path.Ext(p))]
	switch {
	case !ok:
		return fail(fmt.Sprintf("image %s skipped: use PNG, JPG, GIF or WebP", ref))
	case b.h.store == nil:
		return fail("images are skipped: file storage is not set up")
	case len(b.urls) >= maxBookImages:
		return fail(fmt.Sprintf("image %s skipped: a book can have up to %d images", ref, maxBookImages))
	}
	data, err := b.archive.Read(p, maxBookImageBytes)
	if err != nil {
		return fail(fmt.Sprintf("image %s skipped: %v", ref, err))
	}
	if b.total+int64(len(data)) > maxBookImageTotal {
		return fail(fmt.Sprintf("image %s skipped: the book's images are over %d MB in all", ref, maxBookImageTotal>>20))
	}
	sum := sha256.Sum256(data)
	key := fmt.Sprintf("curriculum/%s/%s%s", b.programID, hex.EncodeToString(sum[:10]), strings.ToLower(path.Ext(p)))
	// The key is the image's hash, so one already stored (an earlier import) is the same image
	if rc, _, _, err := b.h.store.Get(b.r.Context(), key); err == nil {
		_ = rc.Close()
		b.urls[p] = b.h.store.GetURL(key)
		return b.urls[p], true
	}
	u, err := b.h.store.Upload(b.r.Context(), key, bytes.NewReader(data), int64(len(data)), contentType)
	if err != nil {
		return fail(fmt.Sprintf("image %s could not be uploaded", ref))
	}
	b.total += int64(len(data))
	b.urls[p] = u
	return u, true
}

func (b *bookImages) warn(msg string) {
	for _, w := range b.warnings {
		if w == msg {
			return
		}
	}
	b.warnings = append(b.warnings, msg)
}
