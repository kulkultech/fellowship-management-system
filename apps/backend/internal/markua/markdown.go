package markua

import (
	"regexp"
	"strings"
)

// Links resolves a chapter's references while it is converted.
type Links struct {
	// Image returns the URL to show for an image path written in the manuscript.
	Image func(ref string) (string, bool)
	// Crosslink returns where a [text](#id) link goes.
	Crosslink func(id string) (string, bool)
}

// Fenced block languages the module viewer shows as an interactive quiz or exercise.
const (
	QuizLang     = "markua-quiz"
	ExerciseLang = "markua-exercise"
)

var (
	directiveRe   = regexp.MustCompile(`^\{[^{}]*\}$`)
	formatRe      = regexp.MustCompile(`^\{\s*format:\s*([A-Za-z0-9_+#-]+)`)
	blockOpenRe   = regexp.MustCompile(`^\{\s*(quiz|exercise|aside|blurb|sidebar)\b([^{}]*)\}$`)
	blurbClassRe  = regexp.MustCompile(`class:\s*"?([a-z]+)`)
	asideLineRe   = regexp.MustCompile(`^([ABDEIQTWX])>(?: ?)(.*)$`)
	imageRe       = regexp.MustCompile(`!\[([^\]]*)\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)`)
	crosslinkRe   = regexp.MustCompile(`\[([^\]]+)\]\(#([^)\s]+)\)`)
	commentRe     = regexp.MustCompile(`<!--.*?-->`)
	backtickRunRe = regexp.MustCompile("(?m)^[ \t]*(`{3,})")
	blankRunRe    = regexp.MustCompile(`\n{3,}`)
)

var asideLabels = map[string]string{
	"A": "Aside", "D": "Discussion", "E": "Error", "I": "Information", "Q": "Question",
	"T": "Tip", "W": "Warning", "X": "Exercise",
}

var blurbLabels = map[string]string{
	"center": "", "discussion": "Discussion", "error": "Error", "information": "Information",
	"question": "Question", "tip": "Tip", "warning": "Warning", "exercise": "Exercise",
}

// ToMarkdown converts a chapter's Markua to Markdown:
//   - directives ({frontmatter}, {width: 50%}, {lines: 4}, …) and HTML comments are dropped,
//   - T>/W>/I>… asides and {aside}/{blurb} blocks become labelled quotes,
//   - {quiz} and {exercise} blocks become markua-quiz / markua-exercise fenced blocks,
//   - images and #id links are resolved through links.
//
// Code blocks are left as written.
func ToMarkdown(src string, links Links) string {
	lines := strings.Split(normalize(src), "\n")
	var out []string
	var fence fenceState
	inComment := false
	pendingLang := ""

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if fence.size > 0 || (!inComment && fenceRe.MatchString(line)) {
			opening := fence.size == 0
			fence.update(line)
			if opening && pendingLang != "" && strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "`~")) == "" {
				line += pendingLang
			}
			pendingLang = ""
			out = append(out, line)
			continue
		}

		// HTML comments, which may span lines
		if inComment {
			end := strings.Index(line, "-->")
			if end < 0 {
				continue
			}
			inComment = false
			line = line[end+3:]
			if strings.TrimSpace(line) == "" {
				continue
			}
		}
		line = commentRe.ReplaceAllString(line, "")
		if start := strings.Index(line, "<!--"); start >= 0 {
			inComment = true
			line = line[:start]
			if strings.TrimSpace(line) == "" {
				continue
			}
		}

		trimmed := strings.TrimSpace(line)

		if m := blockOpenRe.FindStringSubmatch(trimmed); m != nil {
			kind := m[1]
			inner, next := collectBlock(lines, i+1, kind)
			i = next
			out = append(out, block(kind, m[2], inner, links)...)
			continue
		}
		if m := formatRe.FindStringSubmatch(trimmed); m != nil {
			pendingLang = m[1]
			continue
		}
		if directiveRe.MatchString(trimmed) {
			continue
		}
		if partHeadingRe.MatchString(line) {
			line = "#" + strings.TrimPrefix(line, "-")
		}

		if m := asideLineRe.FindStringSubmatch(line); m != nil {
			letter := m[1]
			var inner []string
			for ; i < len(lines); i++ {
				mm := asideLineRe.FindStringSubmatch(lines[i])
				if mm == nil || mm[1] != letter {
					break
				}
				inner = append(inner, mm[2])
			}
			i--
			label := asideLabels[letter]
			out = append(out, quote(label, ToMarkdown(strings.Join(inner, "\n"), links))...)
			continue
		}

		out = append(out, inline(line, links))
	}
	md := strings.Join(out, "\n")
	md = blankRunRe.ReplaceAllString(md, "\n\n")
	return strings.Trim(md, "\n")
}

// collectBlock returns the lines of a {kind}…{/kind} block starting at from, and the index of its
// closing line (the last line when it is never closed).
func collectBlock(lines []string, from int, kind string) ([]string, int) {
	var fence fenceState
	depth := 1
	for j := from; j < len(lines); j++ {
		if fence.update(lines[j]) {
			continue
		}
		t := strings.TrimSpace(lines[j])
		if m := blockOpenRe.FindStringSubmatch(t); m != nil && m[1] == kind {
			depth++
		}
		if t == "{/"+kind+"}" {
			depth--
			if depth == 0 {
				return lines[from:j], j
			}
		}
	}
	return lines[from:], len(lines) - 1
}

func block(kind, attrs string, inner []string, links Links) []string {
	body := ToMarkdown(strings.Join(inner, "\n"), links)
	switch kind {
	case "quiz", "exercise":
		lang := QuizLang
		if kind == "exercise" {
			lang = ExerciseLang
		}
		// The wrapping fence must be longer than any fence inside the block
		size := 4
		for _, m := range backtickRunRe.FindAllStringSubmatch(body, -1) {
			if len(m[1]) >= size {
				size = len(m[1]) + 1
			}
		}
		f := strings.Repeat("`", size)
		return []string{"", f + lang, body, f, ""}
	default:
		label := ""
		if kind == "aside" || kind == "sidebar" {
			label = "Aside"
		}
		if m := blurbClassRe.FindStringSubmatch(attrs); m != nil {
			label = blurbLabels[m[1]]
		}
		return quote(label, body)
	}
}

func quote(label, body string) []string {
	out := []string{""}
	if label != "" {
		out = append(out, "> **"+label+"**", ">")
	}
	for _, l := range strings.Split(body, "\n") {
		if l == "" {
			out = append(out, ">")
		} else {
			out = append(out, "> "+l)
		}
	}
	return append(out, "")
}

// inline rewrites images, #id links and {#id} attributes outside inline code spans.
func inline(line string, links Links) string {
	if !strings.ContainsAny(line, "[{") {
		return line
	}
	parts := strings.Split(line, "`")
	for i := 0; i < len(parts); i += 2 {
		p := parts[i]
		p = trailingAnchorRe.ReplaceAllString(p, "")
		p = imageRe.ReplaceAllStringFunc(p, func(s string) string {
			m := imageRe.FindStringSubmatch(s)
			alt, ref := m[1], m[2]
			if isRemote(ref) {
				return s
			}
			if links.Image != nil {
				if url, ok := links.Image(ref); ok {
					return "![" + alt + "](" + url + ")"
				}
			}
			if alt == "" {
				return ""
			}
			return "*" + alt + "*"
		})
		p = crosslinkRe.ReplaceAllStringFunc(p, func(s string) string {
			m := crosslinkRe.FindStringSubmatch(s)
			if links.Crosslink != nil {
				if href, ok := links.Crosslink(m[2]); ok {
					return "[" + m[1] + "](" + href + ")"
				}
			}
			return m[1]
		})
		parts[i] = p
	}
	return strings.Join(parts, "`")
}

func isRemote(ref string) bool {
	l := strings.ToLower(ref)
	return strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "https://") || strings.HasPrefix(l, "data:") || strings.HasPrefix(l, "/")
}

// ImageRefs lists the local image paths a chapter uses, in order, without repeats.
func ImageRefs(src string) []string {
	var refs []string
	seen := map[string]bool{}
	var fence fenceState
	for _, line := range strings.Split(normalize(src), "\n") {
		if fence.update(line) {
			continue
		}
		for _, m := range imageRe.FindAllStringSubmatch(line, -1) {
			if ref := m[2]; !isRemote(ref) && !seen[ref] {
				seen[ref] = true
				refs = append(refs, ref)
			}
		}
	}
	return refs
}
