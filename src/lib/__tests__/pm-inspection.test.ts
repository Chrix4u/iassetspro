import { describe, expect, it } from 'vitest';
import { assessPmInspection, parsePmInspectionRange, pmInspectionMethod } from '@/lib/pm-inspection';

describe('PM inspection method and measurement rules', () => {
  it('maps instrument measurements and sight inspections distinctly', () => {
    expect(pmInspectionMethod('measurement')).toBe('instrument');
    expect(pmInspectionMethod('dimensional')).toBe('instrument');
    expect(pmInspectionMethod('ndt')).toBe('instrument');
    expect(pmInspectionMethod('visual')).toBe('sight');
    expect(pmInspectionMethod('functional')).toBe('sight');
  });

  it('normalizes configured engineering limits without manufacturing missing bounds', () => {
    expect(parsePmInspectionRange('{"min":10,"max":70,"unit":"°C"}')).toEqual({ min: 10, max: 70, unit: '°C' });
    expect(parsePmInspectionRange('{"max":5,"unit":"bar"}')).toEqual({ max: 5, unit: 'bar' });
    expect(parsePmInspectionRange('{not json')).toEqual({});
  });

  it('requires finite values for instrument readings', () => {
    expect(assessPmInspection({ method: 'instrument', result: 'pass', value: '' })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(assessPmInspection({ method: 'instrument', result: 'pass', value: 'Infinity' })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(assessPmInspection({ method: 'instrument', result: 'pass', value: '22', range: { min: 10, max: 40 } })).toEqual(
      expect.objectContaining({ ok: true, result: 'pass', value: '22', needsCorrectiveWork: false, outsideRange: false }),
    );
  });

  it('overrides falsely claimed Pass on out-of-range instrument values', () => {
    expect(assessPmInspection({
      method: 'instrument', result: 'pass', value: 82, findings: 'Bearing running hotter than limit',
      range: { min: 10, max: 70, unit: '°C' },
    })).toEqual(expect.objectContaining({
      ok: true, result: 'fail', outsideRange: true, needsCorrectiveWork: true,
    }));
  });

  it('requires findings for abnormal sight observations and raises corrective work', () => {
    expect(assessPmInspection({ method: 'sight', result: 'fail' })).toEqual(expect.objectContaining({ ok: false }));
    expect(assessPmInspection({ method: 'sight', result: 'fail', findings: 'Oil leak' })).toEqual(
      expect.objectContaining({ ok: true, result: 'fail', needsCorrectiveWork: true }),
    );
    expect(assessPmInspection({ method: 'sight', result: 'conditional', findings: 'Monitor' })).toEqual(
      expect.objectContaining({ ok: true, result: 'conditional', needsCorrectiveWork: false }),
    );
    expect(assessPmInspection({ method: 'sight', result: 'pass', value: 10 })).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });
});
