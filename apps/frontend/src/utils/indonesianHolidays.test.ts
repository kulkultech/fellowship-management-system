import { describe, it, expect } from 'vitest';
import {
  getIndonesianHoliday,
  isSunday,
  isTanggalMerah,
  getHolidaysForYear,
  formatIndonesianDate,
} from './indonesianHolidays';

describe('indonesianHolidays utility suite', () => {
  it('should identify 17 August 2026 as Indonesian Independence Day', () => {
    const result = getIndonesianHoliday('2026-08-17');
    expect(result.isHoliday).toBe(true);
    expect(result.name).toBe('Hari Kemerdekaan Republik Indonesia');
    expect(result.type).toBe('national_holiday');
  });

  it('should identify 1 January 2026 as New Year holiday', () => {
    const result = getIndonesianHoliday('2026-01-01');
    expect(result.isHoliday).toBe(true);
    expect(result.name).toBe('Tahun Baru 2026 Masehi');
  });

  it('should identify 25 December 2026 as Christmas', () => {
    const result = getIndonesianHoliday('2026-12-25');
    expect(result.isHoliday).toBe(true);
    expect(result.name).toBe('Hari Raya Natal');
  });

  it('should return false for regular working days', () => {
    const result = getIndonesianHoliday('2026-09-30');
    expect(result.isHoliday).toBe(false);
    expect(result.name).toBeUndefined();
  });

  it('should detect Sundays as non-working days', () => {
    // 2026-09-27 is Sunday
    expect(isSunday('2026-09-27')).toBe(true);
    expect(isTanggalMerah('2026-09-27')).toBe(true);

    // 2026-09-28 is Monday (not Sunday and not holiday)
    expect(isSunday('2026-09-28')).toBe(false);
    expect(isTanggalMerah('2026-09-28')).toBe(false);
  });

  it('should retrieve full list of holidays for year 2026', () => {
    const list = getHolidaysForYear(2026);
    expect(list.length).toBeGreaterThanOrEqual(15);
    expect(list.some((h) => h.date === '2026-08-17')).toBe(true);
  });

  it('should format dates in Indonesian locale', () => {
    const formatted = formatIndonesianDate('2026-08-17');
    expect(formatted.toLowerCase()).toContain('agustus');
    expect(formatted).toContain('2026');
  });
});
