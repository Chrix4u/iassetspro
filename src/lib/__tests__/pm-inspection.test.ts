import { describe, expect, it } from 'vitest';
import { evaluateInspectionResult, inspectionDueState, nextInspectionDate, parseInspectionLimits } from '@/lib/pm-inspection';

describe('PM inspection engineering safety rules', () => {
  it('distinguishes overdue, due today and upcoming readings', () => {
    const now = new Date(2026, 10, 7, 12, 0);
    expect(inspectionDueState(new Date(2026, 10, 6), now)).toBe('overdue');
    expect(inspectionDueState(new Date(2026, 10, 7, 20), now)).toBe('due_today');
    expect(inspectionDueState(new Date(2026, 10, 8), now)).toBe('upcoming');
    expect(inspectionDueState(null, now)).toBe('unscheduled');
  });

  it('requires numeric instrument readings and fails out-of-range values regardless of inspector selection', () => {
    const limits = { min: 2, max: 6, unit: 'bar' };
    expect(() => evaluateInspectionResult('measurement', '', 'pass', limits)).toThrow();
    expect(() => evaluateInspectionResult('measurement', 'NaN', 'pass', limits)).toThrow();
    expect(evaluateInspectionResult('measurement', 8, 'pass', limits)).toMatchObject({ outcome: 'fail', isAlarm: true, numericValue: 8 });
    expect(evaluateInspectionResult('measurement', 4, 'pass', limits)).toMatchObject({ outcome: 'pass', isAlarm: false });
    expect(evaluateInspectionResult('measurement', 4, 'needs_attention', limits)).toMatchObject({ outcome: 'needs_attention', isAlarm: true });
  });

  it('records sight checks without inventing numeric readings', () => {
    expect(evaluateInspectionResult('visual', undefined, 'fail', { min: null, max: null, unit: null })).toMatchObject({
      value: null, numericValue: null, outcome: 'fail',
    });
  });

  it('preserves end-of-month cadence and never advances unknown frequencies', () => {
    expect(nextInspectionDate(new Date(2026, 0, 31, 10), 'monthly')?.toISOString()).toBe(new Date(2026, 1, 28, 10).toISOString());
    expect(nextInspectionDate(new Date(2028, 1, 29, 10), 'annually')?.toISOString()).toBe(new Date(2029, 1, 28, 10).toISOString());
    expect(nextInspectionDate(new Date(2026, 0, 1), 'per_start')).toBeNull();
  });

  it('parses engineering limits fail-soft without coercing invalid values', () => {
    expect(parseInspectionLimits('{"min":1,"max":4,"unit":"mm/s"}')).toEqual({ min: 1, max: 4, unit: 'mm/s' });
    expect(parseInspectionLimits('nonsense')).toEqual({ min: null, max: null, unit: null });
  });
});
