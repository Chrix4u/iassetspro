import { describe, expect, it } from 'vitest';
import { parseInspectionCaptureEvidence, mayAdvanceInspectionDue, safeInspectionNextDue } from '@/lib/pm-paper-inspection-evidence';

const now = new Date('2026-11-09T12:00:00.000Z');
const paper = {
  captureSource: 'paper',
  fieldInspectorName: 'Ama Mensah',
  paperReference: 'C314-P267-20261109-A',
  fieldInspectedAt: '2026-11-09T09:15:00.000Z',
};
describe('PM inspection paper-to-digital audit evidence', () => {
  it('retains distinct paper inspector, source worksheet and physical inspection time', () => {
    const result = parseInspectionCaptureEvidence(paper, now);
    expect(result).toMatchObject({
      captureSource: 'paper', fieldInspectorName: 'Ama Mensah',
      paperReference: 'C314-P267-20261109-A',
      fieldInspectedAt: new Date('2026-11-09T09:15:00.000Z'),
    });
  });
  it('accepts direct/legacy capture only without paper fields', () => {
    expect(parseInspectionCaptureEvidence({}, now)).toMatchObject({
      captureSource: 'digital', fieldInspectedAt: null, fieldInspectorName: null,
      paperReference: null,
    });
    expect(() => parseInspectionCaptureEvidence({
      captureSource: 'digital', fieldInspectorName: 'Ama Mensah',
    }, now)).toThrow(/Paper inspection fields/);
    expect(() => parseInspectionCaptureEvidence({ captureSource: 'photo' }, now)).toThrow(/source/);
  });
  it('rejects untraceable or inconsistent paper evidence', () => {
    expect(() => parseInspectionCaptureEvidence({ ...paper, fieldInspectorName: '' }, now)).toThrow(/inspector name/);
    expect(() => parseInspectionCaptureEvidence({ ...paper, paperReference: '' }, now)).toThrow(/reference/);
    expect(() => parseInspectionCaptureEvidence({ ...paper, fieldInspectedAt: '2026-11-09T09:15' }, now)).toThrow(/timezone/);
    expect(() => parseInspectionCaptureEvidence({ ...paper, fieldInspectedAt: 'bad-date' }, now)).toThrow(/date/);
    expect(() => parseInspectionCaptureEvidence({ ...paper, fieldInspectedAt: '2026-11-10T09:15:00.000Z' }, now)).toThrow(/future/);
    expect(() => parseInspectionCaptureEvidence({ ...paper, fieldInspectedAt: '1999-12-31T09:15:00.000Z' }, now)).toThrow(/past/);
  });
  it('rejects impossible field inspection calendar dates and preserves explicit timezone offsets', () => {
    expect(() => parseInspectionCaptureEvidence({
      ...paper, fieldInspectedAt: '2026-02-30T09:15:00.000Z',
    }, now)).toThrow(/real calendar date/);
    const withOffset = parseInspectionCaptureEvidence({
      ...paper, fieldInspectedAt: '2026-11-09T09:15:00+00:00',
    }, now);
    expect(withOffset.fieldInspectedAt?.toISOString()).toBe('2026-11-09T09:15:00.000Z');
  });
  it('never shortens a newer planned due date based on an older paper sheet', () => {
    const next = new Date('2026-11-22T10:00:00.000Z');
    const oldCalculated = new Date('2026-11-16T10:00:00.000Z');
    expect(safeInspectionNextDue(oldCalculated, next, 'paper')).toBe(next);
    expect(safeInspectionNextDue(oldCalculated, next, 'digital')).toBe(oldCalculated);
  });

  it('retains newer due cycles when a paper inspection is keyed in late', () => {
    const newest = new Date('2026-11-09T10:00:00.000Z');
    expect(mayAdvanceInspectionDue(newest, new Date('2026-11-08T10:00:00Z'))).toBe(false);
    expect(mayAdvanceInspectionDue(newest, newest)).toBe(true);
    expect(mayAdvanceInspectionDue(null, new Date('2026-11-08T10:00:00Z'))).toBe(true);
  });
});
