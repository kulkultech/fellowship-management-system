package markua

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func zipOf(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestReadBookFollowsBookTxt(t *testing.T) {
	data := zipOf(t, map[string]string{
		"org-course-abc1234/README.md":                    "# Not a chapter",
		"org-course-abc1234/manuscript/Book.txt":          "01-intro.txt\n\n02-two.txt\nmissing.txt\n",
		"org-course-abc1234/manuscript/01-intro.txt":      "{frontmatter}\n{title \"Ignored\"}\n{mainmatter}\n\n{#intro}\n# Session 1: Intro\n\nHello\n",
		"org-course-abc1234/manuscript/02-two.txt":        "# Part A\n\nA body\n\n```bash\n# not a heading\n```\n\n# Part B {#part-b}\n\nB body\n",
		"org-course-abc1234/manuscript/resources/pic.png": "png",
		"__MACOSX/org-course-abc1234/manuscript/Book.txt": "junk",
	})
	a, err := OpenZip(data)
	if err != nil {
		t.Fatal(err)
	}
	if got := a.TopDir(); got != "org-course-abc1234" {
		t.Fatalf("TopDir = %q", got)
	}
	dir, err := a.FindBookDir("")
	if err != nil || dir != "org-course-abc1234/manuscript" {
		t.Fatalf("FindBookDir = %q, %v", dir, err)
	}
	book, err := a.ReadBook(dir)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, ch := range book.Chapters {
		got = append(got, ch.Key+"|"+ch.Title)
	}
	want := []string{"#intro|Session 1: Intro", "02-two.txt|Part A", "#part-b|Part B"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("chapters = %v, want %v", got, want)
	}
	if !strings.Contains(book.Chapters[1].Body, "# not a heading") {
		t.Errorf("a # line inside code must stay in the chapter: %q", book.Chapters[1].Body)
	}
	if len(book.Warnings) != 1 || !strings.Contains(book.Warnings[0], "missing.txt") {
		t.Errorf("warnings = %v", book.Warnings)
	}
	if p, ok := a.ResolveResource(dir, "01-intro.txt", "pic.png"); !ok || p != dir+"/resources/pic.png" {
		t.Errorf("ResolveResource = %q, %v", p, ok)
	}
	if _, ok := a.ResolveResource(dir, "01-intro.txt", "../../../etc/passwd"); ok {
		t.Error("paths outside the archive must not resolve")
	}
}

func TestFileWithoutHeadingUsesTitleDirective(t *testing.T) {
	chs := SplitChapters("05-notes.txt", "{title \"Course Notes\"}\n\nJust text.\n")
	if len(chs) != 1 || chs[0].Title != "Course Notes" || chs[0].Key != "05-notes.txt" {
		t.Fatalf("chapters = %+v", chs)
	}
	chs = SplitChapters("07-extra-reading.txt", "Just text.\n")
	if chs[0].Title != "Extra reading" {
		t.Fatalf("title = %q", chs[0].Title)
	}
}

func TestToMarkdown(t *testing.T) {
	src := strings.Join([]string{
		"{pagebreak}",
		"<!-- PLACEHOLDER: an image",
		"spanning lines -->",
		"![Diagram](pic.png)",
		"![Missing](nope.png)",
		"See [the intro](#intro) and [elsewhere](#unknown).",
		"Inline `![not](an-image.png)` code.",
		"",
		"T> Save often.",
		"T> Really.",
		"",
		"{format: java}",
		"```",
		"{not: a directive}",
		"```",
		"",
		"{quiz, id: q1}",
		"## Check",
		"",
		"? What prints?",
		"```java",
		"System.out.println(1);",
		"```",
		"",
		"a) 0",
		"B) 1",
		"{/quiz}",
		"",
		"{blurb, class: warning}",
		"Careful.",
		"{/blurb}",
	}, "\n")
	md := ToMarkdown(src, Links{
		Image: func(ref string) (string, bool) {
			if ref == "pic.png" {
				return "https://cdn.example/pic.png", true
			}
			return "", false
		},
		Crosslink: func(id string) (string, bool) { return "#item-1", id == "intro" },
	})
	for _, want := range []string{
		"![Diagram](https://cdn.example/pic.png)",
		"*Missing*",
		"See [the intro](#item-1) and elsewhere.",
		"`![not](an-image.png)`",
		"> **Tip**\n>\n> Save often.\n> Really.",
		"```java\n{not: a directive}\n```",
		"````markua-quiz\n## Check\n\n? What prints?\n```java\nSystem.out.println(1);\n```\n\na) 0\nB) 1\n````",
		"> **Warning**\n>\n> Careful.",
	} {
		if !strings.Contains(md, want) {
			t.Errorf("missing %q in:\n%s", want, md)
		}
	}
	for _, gone := range []string{"PLACEHOLDER", "spanning", "{pagebreak}", "{quiz", "{/quiz}", "{blurb"} {
		if strings.Contains(md, gone) {
			t.Errorf("%q should be removed:\n%s", gone, md)
		}
	}
}

func TestImageRefsSkipsCodeAndRemote(t *testing.T) {
	refs := ImageRefs("![a](one.png) ![b](https://x/y.png)\n```\n![c](two.png)\n```\n![d](one.png) ![e](resources/three.jpg)")
	if strings.Join(refs, ",") != "one.png,resources/three.jpg" {
		t.Fatalf("refs = %v", refs)
	}
}
