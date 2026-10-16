package recurrence

import (
	"testing"
	"time"
)

var jakarta = time.FixedZone("WIB", 7*3600)

func dates(ts []time.Time) []string {
	out := make([]string, len(ts))
	for i, t := range ts {
		out[i] = t.Format("2006-01-02 Mon 15:04")
	}
	return out
}

func mustParse(t *testing.T, s string) Rule {
	t.Helper()
	r, err := Parse(s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return r
}

func expectDates(t *testing.T, got []time.Time, want ...string) {
	t.Helper()
	g := dates(got)
	if len(g) != len(want) {
		t.Fatalf("expected %d dates %v, got %d %v", len(want), want, len(g), g)
	}
	for i := range want {
		if g[i] != want[i] {
			t.Fatalf("date %d: expected %s, got %s (all: %v)", i, want[i], g[i], g)
		}
	}
}

func TestExpand(t *testing.T) {
	// Monday 2 Nov 2026, 19:00 WIB
	start := time.Date(2026, 11, 2, 19, 0, 0, 0, jakarta)

	expectDates(t, Expand(mustParse(t, "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3"), start),
		"2026-11-02 Mon 19:00", "2026-11-09 Mon 19:00", "2026-11-16 Mon 19:00")

	expectDates(t, Expand(mustParse(t, "FREQ=DAILY;INTERVAL=2;COUNT=3"), start),
		"2026-11-02 Mon 19:00", "2026-11-04 Wed 19:00", "2026-11-06 Fri 19:00")

	// Every weekday, ending on a date (inclusive)
	expectDates(t, Expand(mustParse(t, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261109"), start),
		"2026-11-02 Mon 19:00", "2026-11-03 Tue 19:00", "2026-11-04 Wed 19:00", "2026-11-05 Thu 19:00",
		"2026-11-06 Fri 19:00", "2026-11-09 Mon 19:00")

	// Every 2 weeks on Monday and Thursday
	expectDates(t, Expand(mustParse(t, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=4"), start),
		"2026-11-02 Mon 19:00", "2026-11-05 Thu 19:00", "2026-11-16 Mon 19:00", "2026-11-19 Thu 19:00")

	// Monthly on the first Monday, and on the last Friday
	expectDates(t, Expand(mustParse(t, "FREQ=MONTHLY;BYDAY=1MO;COUNT=3"), start),
		"2026-11-02 Mon 19:00", "2026-12-07 Mon 19:00", "2027-01-04 Mon 19:00")
	lastFri := time.Date(2026, 10, 30, 9, 0, 0, 0, jakarta)
	expectDates(t, Expand(mustParse(t, "FREQ=MONTHLY;BYDAY=-1FR;COUNT=3"), lastFri),
		"2026-10-30 Fri 09:00", "2026-11-27 Fri 09:00", "2026-12-25 Fri 09:00")

	// Monthly on day 31 skips short months
	jan31 := time.Date(2027, 1, 31, 10, 0, 0, 0, jakarta)
	expectDates(t, Expand(mustParse(t, "FREQ=MONTHLY;COUNT=3"), jan31),
		"2027-01-31 Sun 10:00", "2027-03-31 Wed 10:00", "2027-05-31 Mon 10:00")

	// Yearly
	expectDates(t, Expand(mustParse(t, "FREQ=YEARLY;COUNT=2"), start),
		"2026-11-02 Mon 19:00", "2027-11-02 Tue 19:00")

	// No end: capped at one year (53 Mondays) and at MaxOccurrences for daily
	if n := len(Expand(mustParse(t, "FREQ=WEEKLY"), start)); n != 53 {
		t.Fatalf("expected 53 weekly sessions in a year, got %d", n)
	}
	if n := len(Expand(mustParse(t, "FREQ=DAILY"), start)); n != MaxOccurrences {
		t.Fatalf("expected daily to stop at %d, got %d", MaxOccurrences, n)
	}
	if n := len(Expand(mustParse(t, "FREQ=DAILY;COUNT=500"), start)); n != MaxOccurrences {
		t.Fatalf("expected COUNT to be capped at %d, got %d", MaxOccurrences, n)
	}
}

func TestParseAndDescribe(t *testing.T) {
	start := time.Date(2026, 11, 2, 19, 0, 0, 0, jakarta)
	cases := map[string]string{
		"FREQ=DAILY":                                 "Daily",
		"FREQ=WEEKLY;BYDAY=MO":                       "Weekly on Monday",
		"FREQ=WEEKLY;BYDAY=FR,MO,WE,TU,TH":           "Every weekday (Monday to Friday)",
		"FREQ=WEEKLY;INTERVAL=2;BYDAY=TH,MO;COUNT=6": "Every 2 weeks on Monday and Thursday, 6 times",
		"FREQ=MONTHLY;BYDAY=1MO":                     "Monthly on the first Monday",
		"FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270131":     "Monthly on the last Friday, until Jan 31, 2027",
		"FREQ=YEARLY":                                "Annually on November 2",
	}
	for in, want := range cases {
		if got := Describe(mustParse(t, in), start); got != want {
			t.Errorf("Describe(%q) = %q, want %q", in, got, want)
		}
	}

	if got, _ := Normalize("RRULE:FREQ=WEEKLY;BYDAY=TH,MO;INTERVAL=1"); got != "FREQ=WEEKLY;BYDAY=MO,TH" {
		t.Errorf("unexpected normalized rule %q", got)
	}
	for _, bad := range []string{"FREQ=HOURLY", "FREQ=WEEKLY;COUNT=2;UNTIL=20270101", "FREQ=DAILY;BYDAY=2MO", "FREQ=WEEKLY;INTERVAL=0", "BYDAY=MO"} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("expected %q to be rejected", bad)
		}
	}
}
