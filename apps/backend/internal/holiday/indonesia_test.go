package holiday_test

import (
	"testing"
	"time"

	"github.com/kulkul/backend/internal/holiday"
)

func TestIsIndonesianHoliday(t *testing.T) {
	tests := []struct {
		name          string
		time          time.Time
		wantHoliday   bool
		wantNameMatch string
	}{
		{
			name:          "Independence Day 17 August 2026 (WIB)",
			time:          time.Date(2026, 8, 17, 10, 0, 0, 0, holiday.WIBLocation),
			wantHoliday:   true,
			wantNameMatch: "Hari Kemerdekaan Republik Indonesia",
		},
		{
			name:          "Independence Day 17 August 2026 (UTC cross-boundary)",
			time:          time.Date(2026, 8, 16, 20, 0, 0, 0, time.UTC), // 20:00 UTC = 03:00 WIB on Aug 17
			wantHoliday:   true,
			wantNameMatch: "Hari Kemerdekaan Republik Indonesia",
		},
		{
			name:          "Idul Fitri 21 March 2026",
			time:          time.Date(2026, 3, 21, 14, 0, 0, 0, holiday.WIBLocation),
			wantHoliday:   true,
			wantNameMatch: "Hari Raya Idul Fitri",
		},
		{
			name:          "New Year 1 January 2026",
			time:          time.Date(2026, 1, 1, 9, 0, 0, 0, holiday.WIBLocation),
			wantHoliday:   true,
			wantNameMatch: "Tahun Baru 2026 Masehi",
		},
		{
			name:          "Christmas 25 December 2026",
			time:          time.Date(2026, 12, 25, 19, 0, 0, 0, holiday.WIBLocation),
			wantHoliday:   true,
			wantNameMatch: "Hari Raya Natal",
		},
		{
			name:        "Regular Work Day 30 September 2026",
			time:        time.Date(2026, 9, 30, 10, 0, 0, 0, holiday.WIBLocation),
			wantHoliday: false,
		},
		{
			name:        "Regular Work Day 15 October 2026",
			time:        time.Date(2026, 10, 15, 15, 0, 0, 0, holiday.WIBLocation),
			wantHoliday: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotHoliday, gotName := holiday.IsIndonesianHoliday(tt.time)
			if gotHoliday != tt.wantHoliday {
				t.Fatalf("IsIndonesianHoliday() gotHoliday = %v, want %v (name: %s)", gotHoliday, tt.wantHoliday, gotName)
			}
			if tt.wantHoliday && gotName == "" {
				t.Fatalf("expected non-empty holiday name")
			}
		})
	}
}

func TestGetHolidays(t *testing.T) {
	holidays2026 := holiday.GetHolidays(2026)
	if len(holidays2026) < 15 {
		t.Fatalf("expected at least 15 holidays in 2026, got %d", len(holidays2026))
	}

	foundAug17 := false
	for _, h := range holidays2026 {
		if h.Date == "2026-08-17" {
			foundAug17 = true
			break
		}
	}
	if !foundAug17 {
		t.Fatalf("expected 2026-08-17 to be present in 2026 holidays list")
	}
}
