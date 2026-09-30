/**
 * Indonesian National Calendar & Public Holidays
 * Official SKB 3 Menteri holiday registry for 2024, 2025, 2026, 2027, 2028.
 */

export interface IndonesianHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national_holiday' | 'cuti_bersama';
}

export const INDONESIAN_HOLIDAYS_MAP: Record<string, IndonesianHoliday> = {
  // --- 2024 ---
  '2024-01-01': { date: '2024-01-01', name: 'Tahun Baru 2024 Masehi', type: 'national_holiday' },
  '2024-02-08': { date: '2024-02-08', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'national_holiday' },
  '2024-02-10': { date: '2024-02-10', name: 'Tahun Baru Imlek 2575 Kongzili', type: 'national_holiday' },
  '2024-03-11': { date: '2024-03-11', name: 'Hari Suci Nyepi (Tahun Baru Saka 1946)', type: 'national_holiday' },
  '2024-03-29': { date: '2024-03-29', name: 'Wafat Yesus Kristus', type: 'national_holiday' },
  '2024-03-31': { date: '2024-03-31', name: 'Hari Paskah', type: 'national_holiday' },
  '2024-04-10': { date: '2024-04-10', name: 'Hari Raya Idul Fitri 1445 H', type: 'national_holiday' },
  '2024-04-11': { date: '2024-04-11', name: 'Hari Raya Idul Fitri 1445 H', type: 'national_holiday' },
  '2024-05-01': { date: '2024-05-01', name: 'Hari Buruh Internasional', type: 'national_holiday' },
  '2024-05-09': { date: '2024-05-09', name: 'Kenaikan Yesus Kristus', type: 'national_holiday' },
  '2024-05-23': { date: '2024-05-23', name: 'Hari Raya Waisak 2568 BE', type: 'national_holiday' },
  '2024-06-01': { date: '2024-06-01', name: 'Hari Lahir Pancasila', type: 'national_holiday' },
  '2024-06-17': { date: '2024-06-17', name: 'Hari Raya Idul Adha 1445 H', type: 'national_holiday' },
  '2024-07-07': { date: '2024-07-07', name: 'Tahun Baru Islam 1446 H', type: 'national_holiday' },
  '2024-08-17': { date: '2024-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'national_holiday' },
  '2024-09-16': { date: '2024-09-16', name: 'Maulid Nabi Muhammad SAW', type: 'national_holiday' },
  '2024-12-25': { date: '2024-12-25', name: 'Hari Raya Natal', type: 'national_holiday' },

  // --- 2025 ---
  '2025-01-01': { date: '2025-01-01', name: 'Tahun Baru 2025 Masehi', type: 'national_holiday' },
  '2025-01-27': { date: '2025-01-27', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'national_holiday' },
  '2025-01-29': { date: '2025-01-29', name: 'Tahun Baru Imlek 2576 Kongzili', type: 'national_holiday' },
  '2025-03-29': { date: '2025-03-29', name: 'Hari Suci Nyepi (Tahun Baru Saka 1947)', type: 'national_holiday' },
  '2025-03-31': { date: '2025-03-31', name: 'Hari Raya Idul Fitri 1446 H', type: 'national_holiday' },
  '2025-04-01': { date: '2025-04-01', name: 'Hari Raya Idul Fitri 1446 H', type: 'national_holiday' },
  '2025-04-18': { date: '2025-04-18', name: 'Wafat Yesus Kristus', type: 'national_holiday' },
  '2025-04-20': { date: '2025-04-20', name: 'Kebangkitan Yesus Kristus (Paskah)', type: 'national_holiday' },
  '2025-05-01': { date: '2025-05-01', name: 'Hari Buruh Internasional', type: 'national_holiday' },
  '2025-05-12': { date: '2025-05-12', name: 'Hari Raya Waisak 2569 BE', type: 'national_holiday' },
  '2025-05-29': { date: '2025-05-29', name: 'Kenaikan Yesus Kristus', type: 'national_holiday' },
  '2025-06-01': { date: '2025-06-01', name: 'Hari Lahir Pancasila', type: 'national_holiday' },
  '2025-06-06': { date: '2025-06-06', name: 'Hari Raya Idul Adha 1446 H', type: 'national_holiday' },
  '2025-06-27': { date: '2025-06-27', name: 'Tahun Baru Islam 1447 H', type: 'national_holiday' },
  '2025-08-17': { date: '2025-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'national_holiday' },
  '2025-09-05': { date: '2025-09-05', name: 'Maulid Nabi Muhammad SAW', type: 'national_holiday' },
  '2025-12-25': { date: '2025-12-25', name: 'Hari Raya Natal', type: 'national_holiday' },

  // --- 2026 (Active Fellowship Year) ---
  '2026-01-01': { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', type: 'national_holiday' },
  '2026-01-16': { date: '2026-01-16', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'national_holiday' },
  '2026-02-17': { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili', type: 'national_holiday' },
  '2026-03-19': { date: '2026-03-19', name: 'Hari Suci Nyepi (Tahun Baru Saka 1948)', type: 'national_holiday' },
  '2026-03-21': { date: '2026-03-21', name: 'Hari Raya Idul Fitri 1447 H', type: 'national_holiday' },
  '2026-03-22': { date: '2026-03-22', name: 'Hari Raya Idul Fitri 1447 H', type: 'national_holiday' },
  '2026-04-03': { date: '2026-04-03', name: 'Wafat Yesus Kristus', type: 'national_holiday' },
  '2026-04-05': { date: '2026-04-05', name: 'Kebangkitan Yesus Kristus (Paskah)', type: 'national_holiday' },
  '2026-05-01': { date: '2026-05-01', name: 'Hari Buruh Internasional', type: 'national_holiday' },
  '2026-05-14': { date: '2026-05-14', name: 'Kenaikan Yesus Kristus', type: 'national_holiday' },
  '2026-05-27': { date: '2026-05-27', name: 'Hari Raya Idul Adha 1447 H', type: 'national_holiday' },
  '2026-05-31': { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE', type: 'national_holiday' },
  '2026-06-01': { date: '2026-06-01', name: 'Hari Lahir Pancasila', type: 'national_holiday' },
  '2026-06-16': { date: '2026-06-16', name: 'Tahun Baru Islam 1448 H', type: 'national_holiday' },
  '2026-08-17': { date: '2026-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'national_holiday' },
  '2026-08-25': { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW', type: 'national_holiday' },
  '2026-12-25': { date: '2026-12-25', name: 'Hari Raya Natal', type: 'national_holiday' },

  // --- 2027 ---
  '2027-01-01': { date: '2027-01-01', name: 'Tahun Baru 2027 Masehi', type: 'national_holiday' },
  '2027-01-05': { date: '2027-01-05', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'national_holiday' },
  '2027-02-06': { date: '2027-02-06', name: 'Tahun Baru Imlek 2578 Kongzili', type: 'national_holiday' },
  '2027-03-08': { date: '2027-03-08', name: 'Hari Suci Nyepi (Tahun Baru Saka 1949)', type: 'national_holiday' },
  '2027-03-10': { date: '2027-03-10', name: 'Hari Raya Idul Fitri 1448 H', type: 'national_holiday' },
  '2027-03-11': { date: '2027-03-11', name: 'Hari Raya Idul Fitri 1448 H', type: 'national_holiday' },
  '2027-03-26': { date: '2027-03-26', name: 'Wafat Yesus Kristus', type: 'national_holiday' },
  '2027-03-28': { date: '2027-03-28', name: 'Kebangkitan Yesus Kristus (Paskah)', type: 'national_holiday' },
  '2027-05-01': { date: '2027-05-01', name: 'Hari Buruh Internasional', type: 'national_holiday' },
  '2027-05-06': { date: '2027-05-06', name: 'Kenaikan Yesus Kristus', type: 'national_holiday' },
  '2027-05-16': { date: '2027-05-16', name: 'Hari Raya Idul Adha 1448 H', type: 'national_holiday' },
  '2027-05-20': { date: '2027-05-20', name: 'Hari Raya Waisak 2571 BE', type: 'national_holiday' },
  '2027-06-01': { date: '2027-06-01', name: 'Hari Lahir Pancasila', type: 'national_holiday' },
  '2027-06-06': { date: '2027-06-06', name: 'Tahun Baru Islam 1449 H', type: 'national_holiday' },
  '2027-08-15': { date: '2027-08-15', name: 'Maulid Nabi Muhammad SAW', type: 'national_holiday' },
  '2027-08-17': { date: '2027-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'national_holiday' },
  '2027-12-25': { date: '2027-12-25', name: 'Hari Raya Natal', type: 'national_holiday' },
};

// Fixed recurring holidays for any unmapped year
export const RECURRING_ANNUAL_HOLIDAYS: Record<string, string> = {
  '01-01': 'Tahun Baru Masehi',
  '05-01': 'Hari Buruh Internasional',
  '06-01': 'Hari Lahir Pancasila',
  '08-17': 'Hari Kemerdekaan Republik Indonesia',
  '12-25': 'Hari Raya Natal',
};

/**
 * Normalizes input date to YYYY-MM-DD string
 */
export function normalizeDateString(date: string | Date): string {
  if (typeof date === 'string') {
    // If it's already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return date.slice(0, 10);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Check if given date is a Sunday
 */
export function isSunday(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(`${normalizeDateString(date)}T00:00:00Z`) : date;
  return d.getUTCDay() === 0;
}

/**
 * Checks whether a given date is an Indonesian National Holiday.
 */
export function getIndonesianHoliday(date: string | Date): {
  isHoliday: boolean;
  name?: string;
  type?: 'national_holiday' | 'cuti_bersama';
} {
  const dateKey = normalizeDateString(date);

  // 1. Direct registry lookup
  if (INDONESIAN_HOLIDAYS_MAP[dateKey]) {
    return {
      isHoliday: true,
      name: INDONESIAN_HOLIDAYS_MAP[dateKey].name,
      type: INDONESIAN_HOLIDAYS_MAP[dateKey].type,
    };
  }

  // 2. Fixed recurring annual holidays
  const monthDay = dateKey.slice(5); // MM-DD
  if (RECURRING_ANNUAL_HOLIDAYS[monthDay]) {
    return {
      isHoliday: true,
      name: RECURRING_ANNUAL_HOLIDAYS[monthDay],
      type: 'national_holiday',
    };
  }

  return { isHoliday: false };
}

/**
 * Check if date is a Public Holiday or Sunday
 */
export function isPublicHolidayOrSunday(date: string | Date): boolean {
  const hol = getIndonesianHoliday(date);
  return hol.isHoliday || isSunday(date);
}

export const isTanggalMerah = isPublicHolidayOrSunday;

/**
 * Get all registered holidays for a specific year
 */
export function getHolidaysForYear(year: number): IndonesianHoliday[] {
  const prefix = String(year);
  const list: IndonesianHoliday[] = [];

  Object.entries(INDONESIAN_HOLIDAYS_MAP).forEach(([dateKey, h]) => {
    if (dateKey.startsWith(prefix)) {
      list.push(h);
    }
  });

  if (list.length === 0) {
    Object.entries(RECURRING_ANNUAL_HOLIDAYS).forEach(([md, name]) => {
      list.push({
        date: `${prefix}-${md}`,
        name,
        type: 'national_holiday',
      });
    });
  }

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Formats a date string into formal Indonesian locale (e.g. "Senin, 17 Agustus 2026")
 */
export function formatIndonesianDate(dateStr: string): string {
  try {
    const d = new Date(`${normalizeDateString(dateStr)}T00:00:00`);
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}
