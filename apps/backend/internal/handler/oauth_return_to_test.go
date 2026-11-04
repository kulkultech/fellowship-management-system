package handler

import "testing"

func TestSafeReturnTo(t *testing.T) {
	cases := map[string]string{
		"/programs/acme/bootcamp/room?section=resources&item=abc": "/programs/acme/bootcamp/room?section=resources&item=abc",
		"/sessions/123/room":    "/sessions/123/room",
		"":                      "",
		"https://evil.example/": "",
		"//evil.example/x":      "",
		"/\\evil.example":       "",
		"javascript:alert(1)":   "",
		"evil.example/x":        "",
		"/ok\r\nSet-Cookie: x":  "",
	}
	for in, want := range cases {
		if got := safeReturnTo(in); got != want {
			t.Errorf("safeReturnTo(%q) = %q, want %q", in, got, want)
		}
	}
}
