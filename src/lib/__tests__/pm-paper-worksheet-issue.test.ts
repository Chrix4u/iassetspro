import { describe, expect, it } from 'vitest';
import { sameSheetScope, paperSheetProgress, isRecordablePaperPoint } from '@/lib/pm-paper-worksheet-issue';
describe('paper sheet issuance and reconciliation', () => {
  it('requires exact unique source task and point IDs', () => {
    expect(sameSheetScope(['b','a'], ['a','b'])).toBe(true);
    expect(sameSheetScope(['a','a'], ['a'])).toBe(false);
    expect(sameSheetScope(['a','b'], ['a','c'])).toBe(false);
  });
  it('counts only sight checks or instrument checks with a configured parameter', () => {
    expect(isRecordablePaperPoint({ inspectionType: 'visual', parameterKey: null })).toBe(true);
    expect(isRecordablePaperPoint({ inspectionType: 'measurement', parameterKey: 'temperature' })).toBe(true);
    expect(isRecordablePaperPoint({ inspectionType: 'measurement', parameterKey: '   ' })).toBe(false);
    expect(isRecordablePaperPoint({ inspectionType: 'measurement', parameterKey: null })).toBe(false);
    expect(isRecordablePaperPoint({ inspectionType: 'legacy', parameterKey: null })).toBe(false);
  });
  it('counts unique readings from the issued sheet, never unrelated points', () => {
    expect(paperSheetProgress(['a','b','c'], new Set(['a','c','unrelated']))).toMatchObject({
      expected: 3, entered: 2, remaining: 1, missingPointIds: ['b'], status: 'partial',
    });
    expect(paperSheetProgress(['a','b'], new Set(['a','b']))).toMatchObject({
      status: 'entered', remaining: 0, missingPointIds: [],
    });
  });
  it('does not treat an empty or unconfigured checklist as complete', () => {
    expect(paperSheetProgress([], new Set())).toMatchObject({ status: 'requires_setup', missingPointIds: [] });
    expect(paperSheetProgress(['a'], new Set())).toMatchObject({ status: 'issued', remaining: 1 });
  });
});
