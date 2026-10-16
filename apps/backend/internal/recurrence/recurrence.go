// Package recurrence expands the repeat rules offered by the session scheduler. It supports the
// RFC 5545 RRULE subset that Google Calendar's "Repeat" and "Custom recurrence" options produce:
// FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, BYDAY (weekdays, or one nth weekday for
// MONTHLY such as 3TH or -1FR), BYMONTHDAY (MONTHLY), COUNT and UNTIL.
package recurrence

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// MaxOccurrences caps how many sessions one series can create.
const MaxOccurrences = 100

// NoEndHorizon is how far ahead a series without COUNT or UNTIL is created.
const NoEndHorizon = 365 * 24 * time.Hour

type Freq string

const (
	Daily   Freq = "DAILY"
	Weekly  Freq = "WEEKLY"
	Monthly Freq = "MONTHLY"
	Yearly  Freq = "YEARLY"
)

// Rule is a parsed repeat rule.
type Rule struct {
	Freq     Freq
	Interval int
	// Weekly: the weekdays to repeat on (empty means the start's weekday).
	ByDay []time.Weekday
	// Monthly: repeat on the nth weekday (1..4, or -1 for last). Zero when unused.
	Nth        int
	NthWeekday time.Weekday
	// Monthly: repeat on this day of the month. Zero when unused.
	ByMonthDay int
	// End: after Count occurrences, or through Until (a local date, inclusive). Both zero means no end.
	Count int
	Until time.Time
}

var dayCodes = map[string]time.Weekday{
	"SU": time.Sunday, "MO": time.Monday, "TU": time.Tuesday, "WE": time.Wednesday,
	"TH": time.Thursday, "FR": time.Friday, "SA": time.Saturday,
}

func dayCode(d time.Weekday) string {
	for code, wd := range dayCodes {
		if wd == d {
			return code
		}
	}
	return ""
}

// Parse reads an RRULE string, with or without the "RRULE:" prefix.
func Parse(s string) (Rule, error) {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(strings.TrimPrefix(s, "RRULE:"), "rrule:")
	if s == "" {
		return Rule{}, errors.New("empty repeat rule")
	}
	rule := Rule{Interval: 1}
	for _, part := range strings.Split(s, ";") {
		if part == "" {
			continue
		}
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			return Rule{}, fmt.Errorf("invalid repeat rule part %q", part)
		}
		key, val := strings.ToUpper(strings.TrimSpace(kv[0])), strings.ToUpper(strings.TrimSpace(kv[1]))
		switch key {
		case "FREQ":
			switch Freq(val) {
			case Daily, Weekly, Monthly, Yearly:
				rule.Freq = Freq(val)
			default:
				return Rule{}, fmt.Errorf("unsupported repeat frequency %q", val)
			}
		case "INTERVAL":
			n, err := strconv.Atoi(val)
			if err != nil || n < 1 || n > 99 {
				return Rule{}, errors.New("repeat interval must be between 1 and 99")
			}
			rule.Interval = n
		case "BYDAY":
			for _, d := range strings.Split(val, ",") {
				d = strings.TrimSpace(d)
				if len(d) < 2 {
					return Rule{}, fmt.Errorf("invalid weekday %q", d)
				}
				code := d[len(d)-2:]
				wd, ok := dayCodes[code]
				if !ok {
					return Rule{}, fmt.Errorf("invalid weekday %q", d)
				}
				if prefix := d[:len(d)-2]; prefix != "" {
					n, err := strconv.Atoi(prefix)
					if err != nil || n == 0 || n < -1 || n > 4 {
						return Rule{}, fmt.Errorf("invalid weekday position %q", d)
					}
					rule.Nth, rule.NthWeekday = n, wd
					continue
				}
				rule.ByDay = append(rule.ByDay, wd)
			}
		case "BYMONTHDAY":
			n, err := strconv.Atoi(val)
			if err != nil || n < 1 || n > 31 {
				return Rule{}, errors.New("day of month must be between 1 and 31")
			}
			rule.ByMonthDay = n
		case "COUNT":
			n, err := strconv.Atoi(val)
			if err != nil || n < 1 {
				return Rule{}, errors.New("number of occurrences must be at least 1")
			}
			rule.Count = n
		case "UNTIL":
			t, err := parseUntil(val)
			if err != nil {
				return Rule{}, err
			}
			rule.Until = t
		case "WKST":
			// Weeks always start on Monday here (the RFC 5545 default).
		default:
			return Rule{}, fmt.Errorf("unsupported repeat option %q", key)
		}
	}
	if rule.Freq == "" {
		return Rule{}, errors.New("repeat rule needs FREQ")
	}
	if rule.Count > 0 && !rule.Until.IsZero() {
		return Rule{}, errors.New("a repeat rule can end after a number of times or on a date, not both")
	}
	if rule.Nth != 0 && rule.Freq != Monthly {
		return Rule{}, errors.New("a weekday position (like 3TH) only works with monthly repeats")
	}
	if rule.ByMonthDay != 0 && rule.Freq != Monthly {
		return Rule{}, errors.New("a day of month only works with monthly repeats")
	}
	if len(rule.ByDay) > 0 && rule.Freq != Weekly {
		return Rule{}, errors.New("repeat weekdays only work with weekly repeats")
	}
	sort.Slice(rule.ByDay, func(i, j int) bool { return mondayIndex(rule.ByDay[i]) < mondayIndex(rule.ByDay[j]) })
	return rule, nil
}

func parseUntil(val string) (time.Time, error) {
	for _, layout := range []string{"20060102T150405Z", "20060102T150405", "20060102"} {
		if t, err := time.Parse(layout, val); err == nil {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid end date %q", val)
}

// String formats the rule as an RRULE value (without the "RRULE:" prefix).
func (r Rule) String() string {
	parts := []string{"FREQ=" + string(r.Freq)}
	if r.Interval > 1 {
		parts = append(parts, fmt.Sprintf("INTERVAL=%d", r.Interval))
	}
	if len(r.ByDay) > 0 {
		codes := make([]string, len(r.ByDay))
		for i, d := range r.ByDay {
			codes[i] = dayCode(d)
		}
		parts = append(parts, "BYDAY="+strings.Join(codes, ","))
	}
	if r.Nth != 0 {
		parts = append(parts, fmt.Sprintf("BYDAY=%d%s", r.Nth, dayCode(r.NthWeekday)))
	}
	if r.ByMonthDay != 0 {
		parts = append(parts, fmt.Sprintf("BYMONTHDAY=%d", r.ByMonthDay))
	}
	if r.Count > 0 {
		parts = append(parts, fmt.Sprintf("COUNT=%d", r.Count))
	}
	if !r.Until.IsZero() {
		parts = append(parts, "UNTIL="+r.Until.Format("20060102"))
	}
	return strings.Join(parts, ";")
}

// Normalize parses and re-formats a rule so equal rules compare equal. Empty stays empty.
func Normalize(s string) (string, error) {
	if strings.TrimSpace(s) == "" {
		return "", nil
	}
	r, err := Parse(s)
	if err != nil {
		return "", err
	}
	return r.String(), nil
}

// WithUntil returns the rule ending on the given local date (dropping any COUNT).
func (r Rule) WithUntil(date time.Time) Rule {
	r.Count = 0
	r.Until = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	return r
}

func mondayIndex(d time.Weekday) int { return (int(d) + 6) % 7 }

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func daysIn(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// nthWeekday returns the day of month of the nth (or last, n = -1) weekday, or 0 if it doesn't exist.
func nthWeekday(year int, month time.Month, n int, wd time.Weekday) int {
	if n == -1 {
		last := daysIn(year, month)
		lastWd := time.Date(year, month, last, 0, 0, 0, 0, time.UTC).Weekday()
		return last - (int(lastWd)-int(wd)+7)%7
	}
	firstWd := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC).Weekday()
	day := 1 + (int(wd)-int(firstWd)+7)%7 + (n-1)*7
	if day > daysIn(year, month) {
		return 0
	}
	return day
}

// Expand lists the start times of a series that begins at start, in the start's location.
// The first occurrence is always start itself. It stops at the rule's end, at MaxOccurrences,
// or one year after start when the rule has no end.
func Expand(r Rule, start time.Time) []time.Time {
	loc := start.Location()
	hour, minute, sec := start.Clock()
	at := func(d time.Time) time.Time {
		return time.Date(d.Year(), d.Month(), d.Day(), hour, minute, sec, 0, loc)
	}
	startDate := dateOnly(start)
	horizon := dateOnly(start.Add(NoEndHorizon))
	limit := MaxOccurrences
	if r.Count > 0 && r.Count < limit {
		limit = r.Count
	}
	interval := r.Interval
	if interval < 1 {
		interval = 1
	}

	out := []time.Time{start}
	add := func(d time.Time) bool {
		if !d.After(startDate) {
			return true // the start itself is already in; skip earlier dates
		}
		if !r.Until.IsZero() && d.After(r.Until) {
			return false
		}
		if r.Until.IsZero() && r.Count == 0 && d.After(horizon) {
			return false
		}
		out = append(out, at(d))
		return len(out) < limit
	}
	if len(out) >= limit {
		return out
	}

	// Safety bound on loop iterations regardless of rule
	const maxSteps = 5000
	switch r.Freq {
	case Daily:
		for k := 1; k < maxSteps; k++ {
			if !add(startDate.AddDate(0, 0, k*interval)) {
				break
			}
		}
	case Weekly:
		days := r.ByDay
		if len(days) == 0 {
			days = []time.Weekday{start.Weekday()}
		}
		weekStart := startDate.AddDate(0, 0, -mondayIndex(start.Weekday()))
	weeks:
		for k := 0; k < maxSteps; k++ {
			ws := weekStart.AddDate(0, 0, 7*k*interval)
			for _, d := range days {
				if !add(ws.AddDate(0, 0, mondayIndex(d))) {
					break weeks
				}
			}
		}
	case Monthly:
		for k := 0; k < maxSteps; k++ {
			first := time.Date(startDate.Year(), startDate.Month()+time.Month(k*interval), 1, 0, 0, 0, 0, time.UTC)
			day := start.Day()
			switch {
			case r.Nth != 0:
				day = nthWeekday(first.Year(), first.Month(), r.Nth, r.NthWeekday)
			case r.ByMonthDay != 0:
				day = r.ByMonthDay
			}
			if day == 0 || day > daysIn(first.Year(), first.Month()) {
				continue // e.g. the 31st in a 30-day month, or a missing 5th weekday
			}
			if !add(time.Date(first.Year(), first.Month(), day, 0, 0, 0, 0, time.UTC)) {
				break
			}
		}
	case Yearly:
		for k := 1; k < maxSteps/50; k++ {
			y := startDate.Year() + k*interval
			if start.Day() > daysIn(y, start.Month()) {
				continue // Feb 29 in a non-leap year
			}
			if !add(time.Date(y, start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)) {
				break
			}
		}
	}
	return out
}

var ordinals = map[int]string{1: "first", 2: "second", 3: "third", 4: "fourth", -1: "last"}

func plural(n int, unit string) string {
	if n == 1 {
		return unit
	}
	return fmt.Sprintf("%d %ss", n, unit)
}

// Describe returns a Google Calendar style summary, e.g. "Weekly on Monday, 10 times".
func Describe(r Rule, start time.Time) string {
	var b strings.Builder
	switch r.Freq {
	case Daily:
		if r.Interval == 1 {
			b.WriteString("Daily")
		} else {
			b.WriteString("Every " + plural(r.Interval, "day"))
		}
	case Weekly:
		days := r.ByDay
		if len(days) == 0 {
			days = []time.Weekday{start.Weekday()}
		}
		names := make([]string, len(days))
		for i, d := range days {
			names[i] = d.String()
		}
		weekdays := len(days) == 5 && days[0] == time.Monday && days[4] == time.Friday && !containsWeekend(days)
		switch {
		case r.Interval == 1 && weekdays:
			b.WriteString("Every weekday (Monday to Friday)")
		case r.Interval == 1:
			b.WriteString("Weekly on " + joinNames(names))
		default:
			b.WriteString("Every " + plural(r.Interval, "week") + " on " + joinNames(names))
		}
	case Monthly:
		prefix := "Monthly"
		if r.Interval > 1 {
			prefix = "Every " + plural(r.Interval, "month")
		}
		switch {
		case r.Nth != 0:
			b.WriteString(fmt.Sprintf("%s on the %s %s", prefix, ordinals[r.Nth], r.NthWeekday))
		case r.ByMonthDay != 0:
			b.WriteString(fmt.Sprintf("%s on day %d", prefix, r.ByMonthDay))
		default:
			b.WriteString(fmt.Sprintf("%s on day %d", prefix, start.Day()))
		}
	case Yearly:
		if r.Interval == 1 {
			b.WriteString("Annually on " + start.Format("January 2"))
		} else {
			b.WriteString("Every " + plural(r.Interval, "year") + " on " + start.Format("January 2"))
		}
	}
	switch {
	case r.Count == 1:
		b.WriteString(", once")
	case r.Count > 1:
		b.WriteString(fmt.Sprintf(", %d times", r.Count))
	case !r.Until.IsZero():
		b.WriteString(", until " + r.Until.Format("Jan 2, 2006"))
	}
	return b.String()
}

func containsWeekend(days []time.Weekday) bool {
	for _, d := range days {
		if d == time.Saturday || d == time.Sunday {
			return true
		}
	}
	return false
}

func joinNames(names []string) string {
	switch len(names) {
	case 0:
		return ""
	case 1:
		return names[0]
	default:
		return strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1]
	}
}
