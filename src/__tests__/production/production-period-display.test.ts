import { describe, expect, it } from 'vitest';
import { formatProductionPeriodLabel } from '@/lib/production-period-display';

describe('production survey date-first labels', () => {
  it('displays production dates in the configured day-first format', () => {
    expect(formatProductionPeriodLabel('2026-11-21')).toBe('21/11/2026');
    expect(formatProductionPeriodLabel('2026-11-21T00:00:00.000Z')).toBe('21/11/2026');
  });
  it('keeps week start dates as calendar dates', () => {
    expect(formatProductionPeriodLabel('2026-11-15')).toBe('15/11/2026');
  });
  it('preserves month, quarter and year group keys without inventing a date', () => {
    expect(formatProductionPeriodLabel('2026-11')).toBe('2026-11');
    expect(formatProductionPeriodLabel('2026-Q4')).toBe('2026-Q4');
    expect(formatProductionPeriodLabel('2026')).toBe('2026');
  });
  it('does not shift observed dates based on the browser timezone', () => {
    expect(formatProductionPeriodLabel('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
    expect(formatProductionPeriodLabel('2026-12-31T00:00:00.000Z')).toBe('31/12/2026');
  });
});
