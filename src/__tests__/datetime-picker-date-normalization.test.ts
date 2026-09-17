import { describe, expect, it } from 'vitest';
import { displayDate, normalizeDateInput } from '@/components/ui/datetime-picker';

describe('DatePicker date normalization', () => {
  it('formats a full ISO timestamp as DD/MM/YYYY', () => {
    const value = '2026-09-17T18:43:51.394Z';
    expect(normalizeDateInput(value)).toBe('2026-09-17');
    expect(displayDate(value)).toBe('17/09/2026');
  });

  it('preserves YYYY-MM-DD values', () => {
    expect(normalizeDateInput('2026-09-17')).toBe('2026-09-17');
    expect(displayDate('2026-09-17')).toBe('17/09/2026');
  });
});
