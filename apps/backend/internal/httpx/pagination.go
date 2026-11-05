package httpx

import (
	"net/http"
	"strconv"
	"strings"
)

const (
	DefaultPageSize = 25
	MaxPageSize     = 100
)

// Page is a requested page of a list: ?page=1&page_size=25 (page starts at 1).
type Page struct {
	Number int
	Size   int
}

// ParsePage reads ?page and ?page_size. ok is false when the request did not ask for a page, so
// endpoints can keep returning the full list to callers that predate pagination.
func ParsePage(r *http.Request) (p Page, ok bool) {
	q := r.URL.Query()
	if q.Get("page") == "" && q.Get("page_size") == "" {
		return Page{}, false
	}
	p.Number, _ = strconv.Atoi(q.Get("page"))
	if p.Number < 1 {
		p.Number = 1
	}
	p.Size, _ = strconv.Atoi(q.Get("page_size"))
	if p.Size < 1 {
		p.Size = DefaultPageSize
	}
	if p.Size > MaxPageSize {
		p.Size = MaxPageSize
	}
	return p, true
}

// Offset is the number of items before this page.
func (p Page) Offset() int { return (p.Number - 1) * p.Size }

// Slice returns this page's items from a full, already filtered and sorted list.
func Slice[T any](items []T, p Page) []T {
	start := p.Offset()
	if start >= len(items) {
		return []T{}
	}
	end := start + p.Size
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}

// PageMeta is added to a paged response so the client can draw page controls.
func PageMeta(p Page, total int) map[string]any {
	return map[string]any{"total": total, "page": p.Number, "page_size": p.Size}
}

// AddPageMeta writes the page info into a response map.
func AddPageMeta(resp map[string]any, p Page, total int) {
	for k, v := range PageMeta(p, total) {
		resp[k] = v
	}
}

// SearchQuery is the request's ?q, trimmed and lower-cased ("" when not searching).
func SearchQuery(r *http.Request) string {
	return strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
}

// Matches reports whether any field contains q (already lower-cased), ignoring case.
// An empty q matches everything.
func Matches(q string, fields ...string) bool {
	if q == "" {
		return true
	}
	for _, f := range fields {
		if strings.Contains(strings.ToLower(f), q) {
			return true
		}
	}
	return false
}
