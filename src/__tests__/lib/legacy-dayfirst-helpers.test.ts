import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatDateLocal, formatDateTime, getDateFormat } from '@/components/shared/helpers';

afterEach(() => vi.unstubAllGlobals());

describe('legacy shared date helpers enforce day-first display', () => {
  it('normalizes old US and ISO preference values', () => {
    const prefs = new Map<string, string>([['company_date_format', 'MM/DD/YYYY']]);
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => prefs.get(key) ?? null } });

    expect(getDateFormat()).toBe('DD/MM/YYYY');
    expect(formatDateLocal('2026-11-12')).toBe('12/11/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
  });

  it('honours selected dashes across old displays', () => {
    const prefs = new Map<string, string>([['iassetspro_date_display_format', 'DD-MM-YYYY']]);
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => prefs.get(key) ?? null } });

    expect(getDateFormat()).toBe('DD-MM-YYYY');
    expect(formatDateLocal('2026-11-12')).toBe('12-11-2026');
    const stamp = new Date(2026, 10, 12, 14, 7);
    expect(formatDateTime(stamp.toISOString())).toMatch(/^12-11-2026 \d{2}:\d{2}$/);
  });
});
