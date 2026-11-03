import { describe, expect, it } from 'vitest';
import {
  pmAssignmentDraftFromMaster,
  validatePmAssignmentTriggerDraft,
  type PmAssignmentTaskDraft,
} from '@/lib/pm-assignment-draft';

const master = {
  id: 'task-1',
  taskNumber: 101,
  description: 'Inspect drive bearing',
  taskType: 'mechanical' as const,
};

const draft = (patch: Partial<PmAssignmentTaskDraft> = {}): PmAssignmentTaskDraft => ({
  ...pmAssignmentDraftFromMaster(master, 'task-1:trigger'),
  nextDueDate: '2026-12-01',
  ...patch,
});

describe('direct PM assignment trigger readiness', () => {
  it('requires a positive whole TBM interval, supported time unit and next due date', () => {
    expect(validatePmAssignmentTriggerDraft(draft())).toBeNull();
    expect(validatePmAssignmentTriggerDraft(draft({ value: '0' }))).toContain('TBM Value');
    expect(validatePmAssignmentTriggerDraft(draft({ value: '1.5' }))).toContain('TBM Value');
    expect(validatePmAssignmentTriggerDraft(draft({ frequencyUnit: 'cycles' }))).toContain('TBM Frequency Unit');
    expect(validatePmAssignmentTriggerDraft(draft({ nextDueDate: '' }))).toContain('TBM Next Due Date');
  });

  it('requires a positive UBM interval and an asset meter', () => {
    const ready = draft({
      pmType: 'ubm',
      frequencyType: 'meter',
      value: '500',
      assetMeterId: 'meter-1',
      nextDueDate: '',
    });
    expect(validatePmAssignmentTriggerDraft(ready)).toBeNull();
    expect(validatePmAssignmentTriggerDraft({ ...ready, value: '0' })).toContain('UBM Value');
    expect(validatePmAssignmentTriggerDraft({ ...ready, assetMeterId: '' })).toContain('asset meter');
  });

  it('requires complete CBM source and threshold configuration including valid outside range', () => {
    const ready = draft({
      pmType: 'cbm',
      conditionSourceType: 'iot_device',
      conditionSourceId: 'device-1',
      conditionMetric: 'temperature',
      conditionOperator: '>=',
      conditionThreshold: '80',
      conditionUnit: '°C',
      nextDueDate: '',
    });
    expect(validatePmAssignmentTriggerDraft(ready)).toBeNull();
    expect(validatePmAssignmentTriggerDraft({ ...ready, conditionSourceId: '' })).toContain('condition source');
    expect(validatePmAssignmentTriggerDraft({ ...ready, conditionThreshold: 'hot' })).toContain('numeric threshold');
    expect(validatePmAssignmentTriggerDraft({ ...ready, conditionOperator: 'outside_range', conditionThresholdMax: '75' })).toContain('upper threshold');
    expect(validatePmAssignmentTriggerDraft({ ...ready, conditionOperator: 'outside_range', conditionThresholdMax: '95' })).toBeNull();
  });

  it('treats FBM as trigger-ready because failure/event occurrence is the trigger', () => {
    expect(validatePmAssignmentTriggerDraft(draft({
      pmType: 'fbm',
      value: '',
      frequencyUnit: '',
      nextDueDate: '',
      assetMeterId: '',
    }))).toBeNull();
  });
});
