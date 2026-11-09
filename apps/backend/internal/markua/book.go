// Package markua reads a Leanpub-style book (a manuscript folder with Book.txt listing the chapter
// files, written in Markua) out of a zip archive, and turns its Markua into the Markdown that
// FellowHire's module viewer shows.
package markua

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"path"
	"regexp"
	"sort"
	"strings"
)

// MaxChapterFileBytes caps one manuscript file read from the archive (guards against zip bombs).
const MaxChapterFileBytes = 4 << 20

// Archive is the files of an uploaded zip, by cleaned slash path.
type Archive struct {
	files map[string]*zip.File
}

// OpenZip indexes a zip archive's regular files. Folders, macOS metadata and unsafe paths are skipped.
func OpenZip(data []byte) (*Archive, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, errors.New("the file is not a valid zip archive")
	}
	a := &Archive{files: map[string]*zip.File{}}
	for _, f := range zr.File {
		name := strings.ReplaceAll(f.Name, "\\", "/")
		if f.FileInfo().IsDir() || strings.HasPrefix(name, "__MACOSX/") || strings.Contains(name, "/__MACOSX/") {
			continue
		}
		clean := path.Clean("/" + name)[1:]
		if clean == "" || strings.HasPrefix(clean, "../") {
			continue
		}
		a.files[clean] = f
	}
	return a, nil
}

// Has reports whether the archive holds a file at p.
func (a *Archive) Has(p string) bool {
	_, ok := a.files[p]
	return ok
}

// Read returns a file's bytes, refusing files larger than max once uncompressed.
func (a *Archive) Read(p string, max int64) ([]byte, error) {
	f, ok := a.files[p]
	if !ok {
		return nil, fmt.Errorf("%s: not in the archive", p)
	}
	if f.UncompressedSize64 > uint64(max) {
		return nil, fmt.Errorf("%s is larger than %d MB", p, max>>20)
	}
	rc, err := f.Open()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", p, err)
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, max+1))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", p, err)
	}
	if int64(len(data)) > max {
		return nil, fmt.Errorf("%s is larger than %d MB", p, max>>20)
	}
	return data, nil
}

// TopDir is the single folder every file sits in (GitHub zips wrap the repository in
// "owner-repo-commit/"), or "" when there is none.
func (a *Archive) TopDir() string {
	top := ""
	for name := range a.files {
		i := strings.Index(name, "/")
		if i < 0 {
			return ""
		}
		if top == "" {
			top = name[:i]
		} else if top != name[:i] {
			return ""
		}
	}
	return top
}

// FindBookDir returns the folder holding Book.txt: the shallowest one, preferring one inside under
// (a folder the person pointed at). Leanpub books keep it in manuscript/.
func (a *Archive) FindBookDir(under string) (string, error) {
	var dirs []string
	for name := range a.files {
		if path.Base(name) == "Book.txt" {
			dirs = append(dirs, path.Dir(name))
		}
	}
	if len(dirs) == 0 {
		return "", errors.New("no Book.txt found. A Leanpub book lists its chapter files, one per line, in manuscript/Book.txt")
	}
	sort.Slice(dirs, func(i, j int) bool {
		di, dj := strings.Count(dirs[i], "/"), strings.Count(dirs[j], "/")
		if di != dj {
			return di < dj
		}
		return dirs[i] < dirs[j]
	})
	if under = strings.Trim(under, "/"); under != "" {
		for _, d := range dirs {
			if d == under || strings.HasSuffix(d, "/"+under) || strings.Contains(d+"/", "/"+under+"/") {
				return d, nil
			}
		}
	}
	return dirs[0], nil
}

// Chapter is one level-1 heading of the book and everything up to the next one.
type Chapter struct {
	// Key identifies the chapter across imports: its {#id}, else its file (plus a number when
	// the file has several chapters).
	Key    string
	Anchor string
	File   string
	Title  string
	// Body is the chapter's Markua, without its title heading.
	Body string
}

// Book is the chapters of a manuscript, in Book.txt order.
type Book struct {
	Dir      string
	Chapters []Chapter
	Warnings []string
}

// ReadBook reads Book.txt in dir and splits each listed file into chapters.
func (a *Archive) ReadBook(dir string) (*Book, error) {
	raw, err := a.Read(path.Join(dir, "Book.txt"), 1<<20)
	if err != nil {
		return nil, err
	}
	book := &Book{Dir: dir}
	seen := map[string]int{}
	for _, line := range strings.Split(normalize(string(raw)), "\n") {
		entry := strings.TrimSpace(line)
		if entry == "" || strings.HasPrefix(entry, "#") || strings.HasPrefix(entry, "//") {
			continue
		}
		file := path.Clean(path.Join(dir, entry))
		if dir != "." && !strings.HasPrefix(file, dir+"/") {
			book.Warnings = append(book.Warnings, fmt.Sprintf("Book.txt lists %s, which is outside the manuscript folder; skipped", entry))
			continue
		}
		if !a.Has(file) {
			book.Warnings = append(book.Warnings, fmt.Sprintf("Book.txt lists %s, but there is no such file; skipped", entry))
			continue
		}
		data, err := a.Read(file, MaxChapterFileBytes)
		if err != nil {
			book.Warnings = append(book.Warnings, err.Error()+"; skipped")
			continue
		}
		rel := strings.TrimPrefix(file, dir+"/")
		for _, ch := range SplitChapters(rel, string(data)) {
			if n := seen[ch.Key]; n > 0 {
				ch.Key = fmt.Sprintf("%s~%d", ch.Key, n+1)
			}
			seen[ch.Key]++
			book.Chapters = append(book.Chapters, ch)
		}
	}
	if len(book.Chapters) == 0 {
		return nil, errors.New("Book.txt lists no chapter files that could be read")
	}
	return book, nil
}

var (
	chapterHeadingRe = regexp.MustCompile(`^#[ \t]+(.+?)[ \t]*#*[ \t]*$`)
	partHeadingRe    = regexp.MustCompile(`^-#[ \t]+`)
	anchorLineRe     = regexp.MustCompile(`^\{\s*(?:#|id:\s*)([A-Za-z0-9_:.-]+)\s*\}$`)
	trailingAnchorRe = regexp.MustCompile(`\s*\{\s*(?:#|id:\s*)([A-Za-z0-9_:.-]+)\s*\}\s*$`)
	titleDirectiveRe = regexp.MustCompile(`^\{\s*title:?\s+"([^"]+)"\s*\}$`)
)

// SplitChapters splits one manuscript file at its level-1 headings. Text before the first heading
// joins the first chapter when it has any content; a file without headings is one chapter titled
// by its {title "…"} or its file name.
func SplitChapters(file, text string) []Chapter {
	lines := strings.Split(normalize(text), "\n")
	var (
		chapters  []Chapter
		preamble  []string
		current   *Chapter
		body      []string
		fence     fenceState
		pendingID string
		titleHint string
	)
	flush := func() {
		if current != nil {
			current.Body = strings.Trim(strings.Join(body, "\n"), "\n")
			chapters = append(chapters, *current)
		}
	}
	for _, line := range lines {
		if fence.update(line) {
			if current == nil {
				preamble = append(preamble, line)
			} else {
				body = append(body, line)
			}
			continue
		}
		trimmed := strings.TrimSpace(line)
		if m := titleDirectiveRe.FindStringSubmatch(trimmed); m != nil && titleHint == "" {
			titleHint = m[1]
		}
		if m := anchorLineRe.FindStringSubmatch(trimmed); m != nil {
			pendingID = m[1]
			continue
		}
		if partHeadingRe.MatchString(line) {
			continue
		}
		if m := chapterHeadingRe.FindStringSubmatch(line); m != nil {
			flush()
			title := m[1]
			if am := trailingAnchorRe.FindStringSubmatch(title); am != nil {
				pendingID = am[1]
				title = strings.TrimSpace(trailingAnchorRe.ReplaceAllString(title, ""))
			}
			current = &Chapter{Anchor: pendingID, File: file, Title: title}
			body = nil
			if len(chapters) == 0 && hasContent(preamble) {
				body = append(body, preamble...)
				body = append(body, "")
			}
			pendingID = ""
			continue
		}
		if pendingID != "" && trimmed != "" {
			pendingID = "" // an id for something other than a chapter heading
		}
		if current == nil {
			preamble = append(preamble, line)
		} else {
			body = append(body, line)
		}
	}
	flush()
	if len(chapters) == 0 {
		title := titleHint
		if title == "" {
			title = fileTitle(file)
		}
		chapters = []Chapter{{File: file, Title: title, Body: strings.Trim(strings.Join(preamble, "\n"), "\n")}}
	}
	for i := range chapters {
		switch {
		case chapters[i].Anchor != "":
			chapters[i].Key = "#" + chapters[i].Anchor
		case i == 0:
			chapters[i].Key = file
		default:
			chapters[i].Key = fmt.Sprintf("%s#%d", file, i+1)
		}
	}
	return chapters
}

// hasContent reports whether lines hold anything beyond directives, comments and blank lines.
func hasContent(lines []string) bool {
	return strings.TrimSpace(ToMarkdown(strings.Join(lines, "\n"), Links{})) != ""
}

var fileNumberRe = regexp.MustCompile(`^\d+[-_ .]+`)

func fileTitle(file string) string {
	base := strings.TrimSuffix(path.Base(file), path.Ext(file))
	base = fileNumberRe.ReplaceAllString(base, "")
	base = strings.NewReplacer("-", " ", "_", " ").Replace(base)
	if base == "" {
		return path.Base(file)
	}
	return strings.ToUpper(base[:1]) + base[1:]
}

func normalize(s string) string {
	s = strings.TrimPrefix(s, "\ufeff")
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\r", "\n")
}

// fenceState follows ``` and ~~~ code fences, so nothing inside code is read as Markua.
type fenceState struct {
	char byte
	size int
}

var fenceRe = regexp.MustCompile("^[ \t]{0,3}(`{3,}|~{3,})")

// update reports whether line is inside a code fence or is one of its fence lines.
func (f *fenceState) update(line string) bool {
	m := fenceRe.FindStringSubmatch(line)
	if f.size > 0 {
		if m != nil && m[1][0] == f.char && len(m[1]) >= f.size && strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), string(f.char))) == "" {
			f.size = 0
		}
		return true
	}
	if m != nil {
		f.char, f.size = m[1][0], len(m[1])
		return true
	}
	return false
}

// ResolveResource finds the archive file an image path in a chapter means. Markua keeps images in
// the manuscript's resources/ folder (older Leanpub books in images/), so a bare file name is looked
// up there too.
func (a *Archive) ResolveResource(bookDir, chapterFile, ref string) (string, bool) {
	ref = strings.SplitN(strings.SplitN(ref, "?", 2)[0], "#", 2)[0]
	if ref == "" || strings.Contains(ref, "\\") {
		return "", false
	}
	for _, p := range []string{
		path.Join(bookDir, path.Dir(chapterFile), ref),
		path.Join(bookDir, ref),
		path.Join(bookDir, "resources", ref),
		path.Join(bookDir, "images", ref),
	} {
		p = path.Clean(p)
		if strings.HasPrefix(p, "../") || p == ".." {
			continue
		}
		if a.Has(p) {
			return p, true
		}
	}
	return "", false
}
