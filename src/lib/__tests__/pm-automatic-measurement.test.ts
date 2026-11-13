import { describe, expect, it } from 'vitest';
import { automaticMeasurementOutcome } from '@/lib/pm-inspection';
import {
  validateMachineChecklistEntry,
  type MachineChecklistPoint,
  type MachineChecklistDraft,
} from '@/lib/pm-machine-checklist';

const limits = JSON.stringify({ min: 50, max: 70, unit: '°C' });
const point: MachineChecklistPoint = {
  id: 'bearing-temperature', componentId: 'bearing-1',
  name: 'Bearing temperature', description: null, inspectionType: 'measurement',
  parameterKey: 'temperature', normalRange: limits,
  frequency: 'weekly', nextInspection: null, dueState: 'unscheduled',
  latestRecord: null, openCorrectiveWorkOrder: null,
};
const draft: MachineChecklistDraft = {
  value: '100', outcome: 'fail', findings: '', recommendation: '', requestKey: '',
};

describe('automatic PM instrument assessment', () => {
  it('fails readings outside the approved threshold even when the technician would select OK', () => {
    expect(automaticMeasurementOutcome('100', limits)).toBe('fail');
    expect(automaticMeasurementOutcome('49.99', limits)).toBe('fail');
    expect(automaticMeasurementOutcome('70.01', limits)).toBe('fail');
  });
  it('passes readings within inclusive min/max thresholds', () => {
    expect(automaticMeasurementOutcome('50', limits)).toBe('pass');
    expect(automaticMeasurementOutcome('65', limits)).toBe('pass');
    expect(automaticMeasurementOutcome('70', limits)).toBe('pass');
  });
  it('never invents OK when no measured value or limits are configured', () => {
    expect(automaticMeasurementOutcome('', limits)).toBeNull();
    expect(automaticMeasurementOutcome('nonsense', limits)).toBeNull();
    expect(automaticMeasurementOutcome('65', null)).toBeNull();
    expect(automaticMeasurementOutcome('65', JSON.stringify({unit:'°C'}))).toBeNull();
  });
  it('allows an objectively failed instrument reading with no extra typed remark', () => {
    expect(validateMachineChecklistEntry(point, draft)).toBeNull();
  });
  it('still requires a written reason for a subjective needs-attention observation', () => {
    expect(validateMachineChecklistEntry(point, { ...draft, value: '60', outcome: 'needs_attention' }))
      .toMatch(/Describe the defect/);
  });
});
