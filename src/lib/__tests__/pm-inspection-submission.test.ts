import { describe, expect, it } from 'vitest';
import { isSameInspectionSubmission, isPendingCorrectiveWorkOrder, type InspectionSubmissionSnapshot } from '../pm-inspection-submission';

const original: InspectionSubmissionSnapshot = {
  inspectionPointId: 'point-1',
  inspectorId: 'technician-1',
  result: 'fail',
  value: '92.5',
  findings: 'Vibration above allowed limit',
  recommendation: 'Inspect bearing',
};

describe('PM inspection idempotent retry payload', () => {
  it('does not leave closed or cancelled corrective work pending on replay', () => {
    expect(isPendingCorrectiveWorkOrder({ status: 'draft' })).toBe(true);
    expect(isPendingCorrectiveWorkOrder({ status: 'in_progress' })).toBe(true);
    expect(isPendingCorrectiveWorkOrder({ status: 'completed' })).toBe(true);
    expect(isPendingCorrectiveWorkOrder({ status: 'closed' })).toBe(false);
    expect(isPendingCorrectiveWorkOrder({ status: 'cancelled' })).toBe(false);
    expect(isPendingCorrectiveWorkOrder(null)).toBe(false);
  });

  it('accepts an exact retry, including nullable empty text', () => {
    expect(isSameInspectionSubmission(original, { ...original })).toBe(true);
    expect(isSameInspectionSubmission(
      { ...original, findings: null },
      { ...original, findings: '' },
    )).toBe(true);
  });

  it('rejects retry keys used by another inspector or inspection point', () => {
    expect(isSameInspectionSubmission(original, { ...original, inspectorId: 'technician-2' })).toBe(false);
    expect(isSameInspectionSubmission(original, { ...original, inspectionPointId: 'point-2' })).toBe(false);
  });

  it('preserves legacy unknown state but rejects changing a recorded state on replay', () => {
    expect(isSameInspectionSubmission(
      { ...original, equipmentState: null },
      { ...original },
    )).toBe(true);
    expect(isSameInspectionSubmission(
      { ...original, equipmentState: 'running' },
      { ...original, equipmentState: 'running' },
    )).toBe(true);
    expect(isSameInspectionSubmission(
      { ...original, equipmentState: 'running' },
      { ...original, equipmentState: 'standstill' },
    )).toBe(false);
    expect(isSameInspectionSubmission(
      { ...original },
      { ...original, equipmentState: 'running' },
    )).toBe(false);
  });

  it('rejects reuse of a request key for a changed reading, outcome or defect', () => {
    expect(isSameInspectionSubmission(original, { ...original, value: '93.5' })).toBe(false);
    expect(isSameInspectionSubmission(original, { ...original, result: 'pass' })).toBe(false);
    expect(isSameInspectionSubmission(original, { ...original, findings: 'Different defect' })).toBe(false);
    expect(isSameInspectionSubmission(original, { ...original, recommendation: 'Replace entire motor' })).toBe(false);
  });
});
