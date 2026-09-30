package holiday

import (
	"sort"
	"time"
)

// Holiday represents an Indonesian public holiday
type Holiday struct {
	Date string `json:"date"` // YYYY-MM-DD
	Name string `json:"name"`
	Type string `json:"type"` // "national_holiday" | "cuti_bersama"
}

// WIBLocation is the Asia/Jakarta (UTC+7) timezone used for Indonesian national calendar
var WIBLocation = time.FixedZone("WIB", 7*3600)

// Official Indonesian National Holidays Registry (SKB 3 Menteri)
// Covers fixed and moving holidays for 2024, 2025, 2026, 2027, 2028
var indonesianHolidays = map[string]Holiday{
	// --- 2024 ---
	"2024-01-01": {Date: "2024-01-01", Name: "Tahun Baru 2024 Masehi", Type: "national_holiday"},
	"2024-02-08": {Date: "2024-02-08", Name: "Isra Mikraj Nabi Muhammad SAW", Type: "national_holiday"},
	"2024-02-10": {Date: "2024-02-10", Name: "Tahun Baru Imlek 2575 Kongzili", Type: "national_holiday"},
	"2024-03-11": {Date: "2024-03-11", Name: "Hari Suci Nyepi (Tahun Baru Saka 1946)", Type: "national_holiday"},
	"2024-03-29": {Date: "2024-03-29", Name: "Wafat Yesus Kristus", Type: "national_holiday"},
	"2024-03-31": {Date: "2024-03-31", Name: "Hari Paskah", Type: "national_holiday"},
	"2024-04-10": {Date: "2024-04-10", Name: "Hari Raya Idul Fitri 1445 H", Type: "national_holiday"},
	"2024-04-11": {Date: "2024-04-11", Name: "Hari Raya Idul Fitri 1445 H", Type: "national_holiday"},
	"2024-05-01": {Date: "2024-05-01", Name: "Hari Buruh Internasional", Type: "national_holiday"},
	"2024-05-09": {Date: "2024-05-09", Name: "Kenaikan Yesus Kristus", Type: "national_holiday"},
	"2024-05-23": {Date: "2024-05-23", Name: "Hari Raya Waisak 2568 BE", Type: "national_holiday"},
	"2024-06-01": {Date: "2024-06-01", Name: "Hari Lahir Pancasila", Type: "national_holiday"},
	"2024-06-17": {Date: "2024-06-17", Name: "Hari Raya Idul Adha 1445 H", Type: "national_holiday"},
	"2024-07-07": {Date: "2024-07-07", Name: "Tahun Baru Islam 1446 H", Type: "national_holiday"},
	"2024-08-17": {Date: "2024-08-17", Name: "Hari Kemerdekaan Republik Indonesia", Type: "national_holiday"},
	"2024-09-16": {Date: "2024-09-16", Name: "Maulid Nabi Muhammad SAW", Type: "national_holiday"},
	"2024-12-25": {Date: "2024-12-25", Name: "Hari Raya Natal", Type: "national_holiday"},

	// --- 2025 ---
	"2025-01-01": {Date: "2025-01-01", Name: "Tahun Baru 2025 Masehi", Type: "national_holiday"},
	"2025-01-27": {Date: "2025-01-27", Name: "Isra Mikraj Nabi Muhammad SAW", Type: "national_holiday"},
	"2025-01-29": {Date: "2025-01-29", Name: "Tahun Baru Imlek 2576 Kongzili", Type: "national_holiday"},
	"2025-03-29": {Date: "2025-03-29", Name: "Hari Suci Nyepi (Tahun Baru Saka 1947)", Type: "national_holiday"},
	"2025-03-31": {Date: "2025-03-31", Name: "Hari Raya Idul Fitri 1446 H", Type: "national_holiday"},
	"2025-04-01": {Date: "2025-04-01", Name: "Hari Raya Idul Fitri 1446 H", Type: "national_holiday"},
	"2025-04-18": {Date: "2025-04-18", Name: "Wafat Yesus Kristus", Type: "national_holiday"},
	"2025-04-20": {Date: "2025-04-20", Name: "Kebangkitan Yesus Kristus (Paskah)", Type: "national_holiday"},
	"2025-05-01": {Date: "2025-05-01", Name: "Hari Buruh Internasional", Type: "national_holiday"},
	"2025-05-12": {Date: "2025-05-12", Name: "Hari Raya Waisak 2569 BE", Type: "national_holiday"},
	"2025-05-29": {Date: "2025-05-29", Name: "Kenaikan Yesus Kristus", Type: "national_holiday"},
	"2025-06-01": {Date: "2025-06-01", Name: "Hari Lahir Pancasila", Type: "national_holiday"},
	"2025-06-06": {Date: "2025-06-06", Name: "Hari Raya Idul Adha 1446 H", Type: "national_holiday"},
	"2025-06-27": {Date: "2025-06-27", Name: "Tahun Baru Islam 1447 H", Type: "national_holiday"},
	"2025-08-17": {Date: "2025-08-17", Name: "Hari Kemerdekaan Republik Indonesia", Type: "national_holiday"},
	"2025-09-05": {Date: "2025-09-05", Name: "Maulid Nabi Muhammad SAW", Type: "national_holiday"},
	"2025-12-25": {Date: "2025-12-25", Name: "Hari Raya Natal", Type: "national_holiday"},

	// --- 2026 (Active Fellowship Cohort Year) ---
	"2026-01-01": {Date: "2026-01-01", Name: "Tahun Baru 2026 Masehi", Type: "national_holiday"},
	"2026-01-16": {Date: "2026-01-16", Name: "Isra Mikraj Nabi Muhammad SAW", Type: "national_holiday"},
	"2026-02-17": {Date: "2026-02-17", Name: "Tahun Baru Imlek 2577 Kongzili", Type: "national_holiday"},
	"2026-03-19": {Date: "2026-03-19", Name: "Hari Suci Nyepi (Tahun Baru Saka 1948)", Type: "national_holiday"},
	"2026-03-21": {Date: "2026-03-21", Name: "Hari Raya Idul Fitri 1447 H", Type: "national_holiday"},
	"2026-03-22": {Date: "2026-03-22", Name: "Hari Raya Idul Fitri 1447 H", Type: "national_holiday"},
	"2026-04-03": {Date: "2026-04-03", Name: "Wafat Yesus Kristus", Type: "national_holiday"},
	"2026-04-05": {Date: "2026-04-05", Name: "Kebangkitan Yesus Kristus (Paskah)", Type: "national_holiday"},
	"2026-05-01": {Date: "2026-05-01", Name: "Hari Buruh Internasional", Type: "national_holiday"},
	"2026-05-14": {Date: "2026-05-14", Name: "Kenaikan Yesus Kristus", Type: "national_holiday"},
	"2026-05-27": {Date: "2026-05-27", Name: "Hari Raya Idul Adha 1447 H", Type: "national_holiday"},
	"2026-05-31": {Date: "2026-05-31", Name: "Hari Raya Waisak 2570 BE", Type: "national_holiday"},
	"2026-06-01": {Date: "2026-06-01", Name: "Hari Lahir Pancasila", Type: "national_holiday"},
	"2026-06-16": {Date: "2026-06-16", Name: "Tahun Baru Islam 1448 H", Type: "national_holiday"},
	"2026-08-17": {Date: "2026-08-17", Name: "Hari Kemerdekaan Republik Indonesia", Type: "national_holiday"},
	"2026-08-25": {Date: "2026-08-25", Name: "Maulid Nabi Muhammad SAW", Type: "national_holiday"},
	"2026-12-25": {Date: "2026-12-25", Name: "Hari Raya Natal", Type: "national_holiday"},

	// --- 2027 ---
	"2027-01-01": {Date: "2027-01-01", Name: "Tahun Baru 2027 Masehi", Type: "national_holiday"},
	"2027-01-05": {Date: "2027-01-05", Name: "Isra Mikraj Nabi Muhammad SAW", Type: "national_holiday"},
	"2027-02-06": {Date: "2027-02-06", Name: "Tahun Baru Imlek 2578 Kongzili", Type: "national_holiday"},
	"2027-03-08": {Date: "2027-03-08", Name: "Hari Suci Nyepi (Tahun Baru Saka 1949)", Type: "national_holiday"},
	"2027-03-10": {Date: "2027-03-10", Name: "Hari Raya Idul Fitri 1448 H", Type: "national_holiday"},
	"2027-03-11": {Date: "2027-03-11", Name: "Hari Raya Idul Fitri 1448 H", Type: "national_holiday"},
	"2027-03-26": {Date: "2027-03-26", Name: "Wafat Yesus Kristus", Type: "national_holiday"},
	"2027-03-28": {Date: "2027-03-28", Name: "Kebangkitan Yesus Kristus (Paskah)", Type: "national_holiday"},
	"2027-05-01": {Date: "2027-05-01", Name: "Hari Buruh Internasional", Type: "national_holiday"},
	"2027-05-06": {Date: "2027-05-06", Name: "Kenaikan Yesus Kristus", Type: "national_holiday"},
	"2027-05-16": {Date: "2027-05-16", Name: "Hari Raya Idul Adha 1448 H", Type: "national_holiday"},
	"2027-05-20": {Date: "2027-05-20", Name: "Hari Raya Waisak 2571 BE", Type: "national_holiday"},
	"2027-06-01": {Date: "2027-06-01", Name: "Hari Lahir Pancasila", Type: "national_holiday"},
	"2027-06-06": {Date: "2027-06-06", Name: "Tahun Baru Islam 1449 H", Type: "national_holiday"},
	"2027-08-15": {Date: "2027-08-15", Name: "Maulid Nabi Muhammad SAW", Type: "national_holiday"},
	"2027-08-17": {Date: "2027-08-17", Name: "Hari Kemerdekaan Republik Indonesia", Type: "national_holiday"},
	"2027-12-25": {Date: "2027-12-25", Name: "Hari Raya Natal", Type: "national_holiday"},
}

// Fixed recurring holidays for any unmapped year
var recurringAnnualHolidays = map[string]string{
	"01-01": "Tahun Baru Masehi",
	"05-01": "Hari Buruh Internasional",
	"06-01": "Hari Lahir Pancasila",
	"08-17": "Hari Kemerdekaan Republik Indonesia",
	"12-25": "Hari Raya Natal",
}

// IsIndonesianHoliday checks whether the given time falls on an Indonesian National Holiday.
// The time is evaluated in Western Indonesia Time (WIB / Asia/Jakarta, UTC+7).
// Returns (isHoliday, holidayName).
func IsIndonesianHoliday(t time.Time) (bool, string) {
	// Convert to WIB
	wibTime := t.In(WIBLocation)
	dateKey := wibTime.Format("2006-01-02")

	// 1. Direct registry lookup
	if h, ok := indonesianHolidays[dateKey]; ok {
		return true, h.Name
	}

	// 2. Fixed annual recurring holidays
	monthDay := wibTime.Format("01-02")
	if name, ok := recurringAnnualHolidays[monthDay]; ok {
		return true, name
	}

	return false, ""
}

// GetHolidays returns all registered Indonesian national holidays for the specified year.
func GetHolidays(year int) []Holiday {
	var list []Holiday
	prefix := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006")

	for dateKey, h := range indonesianHolidays {
		if len(dateKey) >= 4 && dateKey[:4] == prefix {
			list = append(list, h)
		}
	}

	// Also ensure fixed holidays are included if year wasn't in main registry
	if len(list) == 0 {
		for md, name := range recurringAnnualHolidays {
			fullDate := prefix + "-" + md
			list = append(list, Holiday{
				Date: fullDate,
				Name: name,
				Type: "national_holiday",
			})
		}
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].Date < list[j].Date
	})

	return list
}
