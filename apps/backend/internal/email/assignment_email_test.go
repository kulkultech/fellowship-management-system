package email

import (
	"strings"
	"testing"
	"time"

	"github.com/kulkul/backend/internal/model"
)

func TestBuildAssignmentEmail(t *testing.T) {
	due := time.Date(2026, 11, 20, 16, 0, 0, 0, time.UTC) // 23:00 WIB
	a := &model.ProgramAssignment{Title: "KV <Store>", Description: strings.Repeat("x", 400), MaxScore: 50, DueDate: &due}
	subject, html, text := buildAssignmentEmail("Jane", "RSA 2026", a, "https://fellowhire.test/programs/acme/rsa/room?section=assignments&item=1", "https://fellowhire.test", "support@test")

	if subject != "New assignment: KV <Store> - RSA 2026" {
		t.Errorf("subject = %q", subject)
	}
	for _, want := range []string{"KV &lt;Store&gt;", "Friday, 20 Nov 2026, 23:00 WIB", "Open Assignment", "section=assignments&amp;item=1", "…"} {
		if !strings.Contains(html, want) {
			t.Errorf("html is missing %q", want)
		}
	}
	if strings.Contains(html, "<Store>") {
		t.Error("title must be escaped in HTML")
	}
	if !strings.Contains(text, "Points: 50") {
		t.Errorf("text = %q", text)
	}
}
