package handler

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/kulkul/backend/internal/model"
)

// applicantRow is one candidate in the admin list, with what sorting needs beyond the JSON item.
type applicantRow struct {
	item      ApplicantListItem
	createdAt time.Time
}

// Stage tabs on the candidates screen. A tab counts everyone who got at least that far.
func inStageGroup(it ApplicantListItem, group string) bool {
	switch group {
	case "":
		return true
	case "test_completed":
		return it.CurrentStage == model.StageTestCompleted || it.CurrentStage == "logic_test_passed" ||
			(it.MCQPassed != nil && *it.MCQPassed)
	case "ai_interview_completed":
		return it.CurrentStage == "ai_interview_completed" || (it.AIScore != nil && *it.AIScore > 0)
	default:
		return string(it.CurrentStage) == group
	}
}

func applicantStageCounts(rows []applicantRow) map[string]int {
	counts := map[string]int{"all": len(rows), "test_completed": 0, "ai_interview_completed": 0, "approved_for_live": 0}
	for _, row := range rows {
		for _, g := range []string{"test_completed", "ai_interview_completed", "approved_for_live"} {
			if inStageGroup(row.item, g) {
				counts[g]++
			}
		}
	}
	return counts
}

// applicantCustomKeys lists every application-form answer key in use, so the table can offer
// those columns even when they appear on no row of the current page.
func applicantCustomKeys(rows []applicantRow) []string {
	seen := map[string]bool{}
	keys := []string{}
	for _, row := range rows {
		for k := range row.item.CustomResponses {
			if !seen[k] {
				seen[k] = true
				keys = append(keys, k)
			}
		}
	}
	sort.Strings(keys)
	return keys
}

type applicantFilters struct {
	query      string // lower-case
	stageGroup string
	trackID    string
}

func (f applicantFilters) match(row applicantRow) bool {
	it := row.item
	if !inStageGroup(it, f.stageGroup) {
		return false
	}
	if f.trackID != "" && it.TrackID != f.trackID {
		return false
	}
	if f.query == "" {
		return true
	}
	fields := []string{it.FullName, it.FirstName, it.LastName, it.Email, it.Phone, it.University, it.Major,
		it.TrackName, string(it.CurrentStage)}
	if it.AIRecommendation != nil {
		fields = append(fields, *it.AIRecommendation)
	}
	for _, v := range it.CustomResponses {
		if v != nil {
			fields = append(fields, answerText(v))
		}
	}
	for _, field := range fields {
		if strings.Contains(strings.ToLower(field), f.query) {
			return true
		}
	}
	return false
}

// answerText renders a form answer the way the browser shows it (lists joined by commas).
func answerText(v interface{}) string {
	if list, ok := v.([]interface{}); ok {
		parts := make([]string, len(list))
		for i, x := range list {
			parts[i] = answerText(x)
		}
		return strings.Join(parts, ",")
	}
	return fmt.Sprint(v)
}

type sortRule struct {
	column string
	desc   bool
}

// parseSortRules reads "column:asc,column:desc" (highest priority first).
func parseSortRules(raw string) []sortRule {
	var rules []sortRule
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		col, dir, _ := strings.Cut(part, ":")
		rules = append(rules, sortRule{column: col, desc: strings.EqualFold(dir, "desc")})
	}
	return rules
}

// sortValue is a cell's value for sorting: a number, a lower-case string, or nothing (empty).
type sortValue struct {
	num   float64
	str   string
	isNum bool
	empty bool
}

func textValue(s string) sortValue {
	s = strings.TrimSpace(s)
	if s == "" {
		return sortValue{empty: true}
	}
	return sortValue{str: strings.ToLower(s)}
}

func numValue(f float64) sortValue { return sortValue{num: f, isNum: true} }

func optionalText(s *string) sortValue {
	if s == nil {
		return sortValue{empty: true}
	}
	return textValue(*s)
}

var dateLayouts = []string{"2006-01-02", time.RFC3339, "2006-01-02 15:04", "02/01/2006", "01/02/2006"}

func dateValue(s string) sortValue {
	for _, layout := range dateLayouts {
		if t, err := time.Parse(layout, strings.TrimSpace(s)); err == nil {
			return numValue(float64(t.Unix()))
		}
	}
	return sortValue{empty: true}
}

func applicantSortValue(row applicantRow, column string) sortValue {
	it := row.item
	switch column {
	case "candidate":
		if it.FullName != "" {
			return textValue(it.FullName)
		}
		return textValue(it.Email)
	case "track":
		if it.TrackName == "" {
			return textValue("General")
		}
		return textValue(it.TrackName)
	case "stage":
		return textValue(string(it.CurrentStage))
	case "mcq_score":
		if it.MCQScore == nil {
			return sortValue{empty: true}
		}
		return numValue(float64(*it.MCQScore))
	case "ai_score":
		if it.AIScore == nil || *it.AIScore <= 0 {
			return sortValue{empty: true}
		}
		return numValue(float64(*it.AIScore))
	case "ai_recommendation":
		return optionalText(it.AIRecommendation)
	case "applied_date":
		return numValue(float64(row.createdAt.Unix()))
	case "phone":
		return textValue(it.Phone)
	case "university":
		return textValue(it.University)
	case "major":
		return textValue(it.Major)
	case "semester":
		return textValue(it.Semester)
	case "referral_source":
		return textValue(it.ReferralSource)
	case "date_of_birth":
		return dateValue(it.DateOfBirth)
	case "linkedin_url":
		return textValue(it.LinkedInURL)
	case "github_url":
		return textValue(it.GitHubURL)
	case "resume_url":
		return textValue(it.ResumeURL)
	case "reviewer_mark":
		if it.ReviewerMark == nil {
			return sortValue{empty: true}
		}
		return numValue(*it.ReviewerMark)
	case "reviewer_notes":
		if it.ReviewerNotes != "" {
			return textValue(it.ReviewerNotes)
		}
		return textValue(it.Notes)
	}
	if key, ok := strings.CutPrefix(column, "custom_"); ok {
		switch v := it.CustomResponses[key].(type) {
		case nil:
			return sortValue{empty: true}
		case float64:
			return numValue(v)
		case bool:
			if v {
				return numValue(1)
			}
			return numValue(0)
		case string:
			if strings.TrimSpace(v) == "" {
				return sortValue{empty: true}
			}
			if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
				return numValue(f)
			}
			return textValue(v)
		default:
			return textValue(answerText(v))
		}
	}
	return sortValue{empty: true}
}

// sortApplicantRows sorts by each rule in turn. Empty values stay last in both directions, and
// text compares naturally ("item 2" before "item 10").
func sortApplicantRows(rows []applicantRow, rules []sortRule) {
	if len(rules) == 0 {
		return
	}
	sort.SliceStable(rows, func(i, j int) bool {
		for _, rule := range rules {
			a, b := applicantSortValue(rows[i], rule.column), applicantSortValue(rows[j], rule.column)
			switch {
			case a.empty && b.empty:
				continue
			case a.empty:
				return false
			case b.empty:
				return true
			}
			var cmp int
			if a.isNum && b.isNum {
				switch {
				case a.num < b.num:
					cmp = -1
				case a.num > b.num:
					cmp = 1
				}
			} else {
				cmp = naturalCompare(a.text(), b.text())
			}
			if cmp != 0 {
				if rule.desc {
					return cmp > 0
				}
				return cmp < 0
			}
		}
		return false
	})
}

func (v sortValue) text() string {
	if v.isNum {
		return strconv.FormatFloat(v.num, 'f', -1, 64)
	}
	return v.str
}

// naturalCompare compares strings with runs of digits compared as numbers.
func naturalCompare(a, b string) int {
	ar, br := []rune(a), []rune(b)
	i, j := 0, 0
	for i < len(ar) && j < len(br) {
		if unicode.IsDigit(ar[i]) && unicode.IsDigit(br[j]) {
			si := i
			for i < len(ar) && unicode.IsDigit(ar[i]) {
				i++
			}
			sj := j
			for j < len(br) && unicode.IsDigit(br[j]) {
				j++
			}
			na := strings.TrimLeft(string(ar[si:i]), "0")
			nb := strings.TrimLeft(string(br[sj:j]), "0")
			if len(na) != len(nb) {
				if len(na) < len(nb) {
					return -1
				}
				return 1
			}
			if na != nb {
				if na < nb {
					return -1
				}
				return 1
			}
			continue
		}
		if ar[i] != br[j] {
			if ar[i] < br[j] {
				return -1
			}
			return 1
		}
		i++
		j++
	}
	switch {
	case len(ar)-i < len(br)-j:
		return -1
	case len(ar)-i > len(br)-j:
		return 1
	}
	return 0
}
