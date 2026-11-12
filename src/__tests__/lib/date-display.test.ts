import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatUiDate, formatUiDateTime, getDayFirstDateFormat, normalizeDayFirstDateFormat,
} from '@/lib/date-display';

afterEach(() => vi.unstubAllGlobals());

describe('iAssetsPro day-first display date policy', () => {
  it('uses DD/MM/YYYY by default and supports DD-MM-YYYY', () => {
    expect(normalizeDayFirstDateFormat()).toBe('DD/MM/YYYY');
    expect(normalizeDayFirstDateFormat('YYYY-MM-DD')).toBe('DD/MM/YYYY');
    expect(normalizeDayFirstDateFormat('MM/DD/YYYY')).toBe('DD/MM/YYYY');
    expect(normalizeDayFirstDateFormat('DD-MM-YYYY')).toBe('DD-MM-YYYY');
    expect(formatUiDate('2026-11-12')).toBe('12/11/2026');
    expect(formatUiDate('2026-11-12', 'DD-MM-YYYY')).toBe('12-11-2026');
  });
  it('interprets ISO date-only as a calendar date without timezone rollback', () => {
    expect(formatUiDate('2026-01-01')).toBe('01/01/2026');
    expect(formatUiDateTime('2026-01-01')).toBe('01/01/2026');
  });
  it('accepts day-first strings and rejects impossible or missing dates', () => {
    expect(formatUiDate('15/09/2026')).toBe('15/09/2026');
    expect(formatUiDate('15-09-2026', 'DD-MM-YYYY')).toBe('15-09-2026');
    expect(formatUiDate('2026-02-31')).toBe('—');
    expect(formatUiDate('31/02/2026')).toBe('—');
    expect(formatUiDate(null)).toBe('—');
  });
  it('preserves a 24-hour time after the day-first date', () => {
    const date = new Date(2026, 10, 12, 14, 7);
    expect(formatUiDateTime(date)).toBe('12/11/2026 14:07');
    expect(formatUiDateTime(date, 'DD-MM-YYYY')).toBe('12-11-2026 14:07');
  });
  it('honours a saved day-first preference, ignoring old US-style preferences', () => {
    const entries = new Map<string, string>([
      ['iassetspro_date_display_format', 'DD-MM-YYYY'],
      ['eam_user_preferences', JSON.stringify({dateTime:{dateFormat:'MM/DD/YYYY'}})],
    ]);
    vi.stubGlobal('window', {localStorage:{getItem:(key:string)=>entries.get(key)??null}});
    expect(getDayFirstDateFormat()).toBe('DD-MM-YYYY');
    expect(formatUiDate('2026-11-12')).toBe('12-11-2026');
    entries.delete('iassetspro_date_display_format');
    expect(getDayFirstDateFormat()).toBe('DD/MM/YYYY');
  });
});
