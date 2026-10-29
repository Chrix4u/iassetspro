import { describe, expect, it } from 'vitest';
import {
  clearPmAssignmentConditionBinding,
  formatPmAssignmentEstimatedTime,
  pmAssignmentDraftFromMaster,
  pmAssignmentTaskPayload,
  totalPmAssignmentEstimatedMinutes,
  validatePmAssignmentTaskDraft,
} from '@/lib/pm-assignment-draft';

const master = {
  id: 'task-1',
  taskNumber: 101,
  description: 'Inspect drive bearing',
  taskType: 'mechanical' as const,
};

describe('direct PM assignment task drafts', () => {
  it('creates independent row identities even when the Task Library identity is reused', () => {
    const first = pmAssignmentDraftFromMaster(master, 'task-1:direct:1');
    const second = pmAssignmentDraftFromMaster(master, 'task-1:direct:2');
    expect(first.pmTaskId).toBe(second.pmTaskId);
    expect(first.clientId).not.toBe(second.clientId);
    expect(first).toEqual(expect.objectContaining({ pmType: 'tbm', activityMode: 'inspection', inspectionType: 'standstill' }));
  });

  it('totals task duration and formats minutes/hours for the live planner summary', () => {
    const tasks = [
      { ...pmAssignmentDraftFromMaster(master, '1'), estimatedMinutes: '25' },
      { ...pmAssignmentDraftFromMaster(master, '2'), estimatedMinutes: '50' },
    ];
    expect(totalPmAssignmentEstimatedMinutes(tasks)).toBe(75);
    expect(formatPmAssignmentEstimatedTime(75)).toBe('1 h 15 min');
  });

  it('requires the configured machine meter for UBM and sends only its ID as authority', () => {
    const row = {
      ...pmAssignmentDraftFromMaster(master, '1'),
      pmType: 'ubm' as const,
      frequencyType: 'meter' as const,
      value: '500',
      assetMeterId: 'meter-1',
      frequencyUnit: 'hours',
    };
    expect(validatePmAssignmentTaskDraft(row)).toBeNull();
    expect(pmAssignmentTaskPayload(row)).toEqual(expect.objectContaining({
      pmTaskId: 'task-1',
      pmType: 'ubm',
      value: 500,
      assetMeterId: 'meter-1',
      unit: null,
    }));
  });

  it('clears component-bound CBM signals when the PM target changes', () => {
    const cbm = {
      ...pmAssignmentDraftFromMaster(master, '1'),
      pmType: 'cbm' as const,
      conditionSourceType: 'component_condition' as const,
      conditionSourceId: 'component-old',
      conditionMetric: 'temperature',
      conditionThreshold: '80',
      conditionThresholdMax: '100',
      conditionUnit: '°C',
    };
    expect(clearPmAssignmentConditionBinding(cbm)).toEqual(expect.objectContaining({
      conditionSourceType: '',
      conditionSourceId: '',
      conditionMetric: '',
      conditionThreshold: '',
      conditionThresholdMax: '',
      conditionUnit: '',
    }));
    const tbm = pmAssignmentDraftFromMaster(master, '2');
    expect(clearPmAssignmentConditionBinding(tbm)).toBe(tbm);
  });

  it('keeps CBM and FBM recurrence semantics separate from time/meter cadence', () => {
    const cbm = {
      ...pmAssignmentDraftFromMaster(master, '1'),
      pmType: 'cbm' as const,
      conditionSourceType: 'iot_device' as const,
      conditionSourceId: 'device-1',
      conditionMetric: 'temperature',
      conditionOperator: '>=' as const,
      conditionThreshold: '80',
      conditionUnit: '°C',
    };
    const fbm = { ...pmAssignmentDraftFromMaster(master, '2'), pmType: 'fbm' as const };
    expect(validatePmAssignmentTaskDraft(cbm)).toBeNull();
    expect(validatePmAssignmentTaskDraft(fbm)).toBeNull();
    expect(pmAssignmentTaskPayload(cbm)).toEqual(expect.objectContaining({ value: null, unit: null, conditionThreshold: 80 }));
    expect(pmAssignmentTaskPayload(fbm)).toEqual(expect.objectContaining({ value: null, unit: null, assetMeterId: null }));
  });
});
