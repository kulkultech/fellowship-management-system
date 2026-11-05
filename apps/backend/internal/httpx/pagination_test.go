package httpx

import (
	"net/http/httptest"
	"testing"
)

func TestParsePageAndSlice(t *testing.T) {
	if _, ok := ParsePage(httptest.NewRequest("GET", "/x", nil)); ok {
		t.Fatal("no page params should mean the full list")
	}
	p, ok := ParsePage(httptest.NewRequest("GET", "/x?page=2&page_size=10", nil))
	if !ok || p.Number != 2 || p.Size != 10 || p.Offset() != 10 {
		t.Fatalf("got %+v", p)
	}
	if p, _ := ParsePage(httptest.NewRequest("GET", "/x?page=0&page_size=999", nil)); p.Number != 1 || p.Size != MaxPageSize {
		t.Fatalf("page and size should be clamped, got %+v", p)
	}
	items := []int{1, 2, 3, 4, 5}
	if got := Slice(items, Page{Number: 2, Size: 2}); len(got) != 2 || got[0] != 3 {
		t.Fatalf("page 2 = %v", got)
	}
	if got := Slice(items, Page{Number: 3, Size: 2}); len(got) != 1 || got[0] != 5 {
		t.Fatalf("last page = %v", got)
	}
	if got := Slice(items, Page{Number: 9, Size: 2}); len(got) != 0 {
		t.Fatalf("past the end = %v", got)
	}
}

func TestMatches(t *testing.T) {
	if !Matches("", "anything") {
		t.Fatal("empty query should match")
	}
	if !Matches("ann", "Bob", "Joanna") {
		t.Fatal("expected a case-insensitive match")
	}
	if Matches("zed", "Bob", "") {
		t.Fatal("unexpected match")
	}
}
