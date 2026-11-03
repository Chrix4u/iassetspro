import { describe, expect, it } from 'vitest';
import {
  pmAssignmentDraftFromApi,
  pmAssignmentDraftFromMaster,
  pmAssignmentTaskPayload,
  validatePmAssignmentTaskDraft,
} from '@/lib/pm-assignment-draft';

const master = {
  id: 'task-1',
  taskNumber: 1,
  description: 'Inspect bearing',
  taskType: 'mechanical' as const,
};

describe('PM assignment draft frequency independence', () => {
  it('reloads calendar basis independently from CBM PM Type', () => {
    const draft = pmAssignmentDraftFromApi({
      id: 'assignment-1',
      pmTaskId: 'task-1',
      pmType: 'cbm',
      basis: 'calendar',
      frequencyInterval: 14,
      frequencyUnit: 'days',
      nextDueDate: '2026-11-17T00:00:00.000Z',
      pmTask: master,
    });
    expect(draft.pmType).toBe('cbm');
    expect(draft.frequencyType).toBe('time_day');
    expect(draft.frequencyUnit).toBe('days');
    expect(draft.nextDueDate).toBe('2026-11-17');
  });

  it('reloads meter basis independently from FBM PM Type', () => {
    const draft = pmAssignmentDraftFromApi({
      id: 'assignment-2',
      pmTaskId: 'task-1',
      pmType: 'fbm',
      basis: 'meter',
      frequencyInterval: 250,
      frequencyUnit: 'h',
      assetMeterId: 'meter-1',
      pmTask: master,
    });
    expect(draft.pmType).toBe('fbm');
    expect(draft.frequencyType).toBe('meter');
    expect(draft.assetMeterId).toBe('meter-1');
  });

  it('reloads null basis as event independently from TBM PM Type', () => {
    const draft = pmAssignmentDraftFromApi({
      id: 'assignment-3',
      pmTaskId: 'task-1',
      pmType: 'tbm',
      basis: null,
      pmTask: master,
    });
    expect(draft.pmType).toBe('tbm');
    expect(draft.frequencyType).toBe('event');
  });

  it('validates calendar cadence by Frequency Type rather than CBM classification', () => {
    const draft = {
      ...pmAssignmentDraftFromMaster(master, 'draft-1'),
      pmType: 'cbm' as const,
      frequencyType: 'time_day' as const,
      frequencyUnit: 'weeks',
      value: '2',
      nextDueDate: '2026-11-17',
      conditionSourceType: '' as const,
      conditionSourceId: '',
      conditionMetric: '',
      conditionThreshold: '',
    };
    expect(validatePmAssignmentTaskDraft(draft)).toBeNull();
  });

  it('serializes CBM + calendar cadence without condition trigger fields', () => {
    const draft = {
      ...pmAssignmentDraftFromMaster(master, 'draft-2'),
      pmType: 'cbm' as const,
      frequencyType: 'time_day' as const,
      frequencyUnit: 'weeks',
      value: '2',
      nextDueDate: '2026-11-17',
      conditionSourceType: 'component_condition' as const,
      conditionSourceId: 'component-1',
      conditionMetric: 'vibration',
      conditionThreshold: '5',
      conditionUnit: 'mm/s',
    };
    expect(pmAssignmentTaskPayload(draft)).toEqual(expect.objectContaining({
      pmType: 'cbm',
      frequencyType: 'time_day',
      value: 2,
      unit: 'weeks',
      nextDueDate: '2026-11-17',
      assetMeterId: null,
      conditionSourceType: null,
      conditionSourceId: null,
      conditionMetric: null,
      conditionThreshold: null,
    }));
  });

  it('serializes FBM + meter cadence without changing the PM Type', () => {
    const draft = {
      ...pmAssignmentDraftFromMaster(master, 'draft-3'),
      pmType: 'fbm' as const,
      frequencyType: 'meter' as const,
      frequencyUnit: 'h',
      value: '250',
      assetMeterId: 'meter-1',
      nextDueDate: '',
    };
    expect(validatePmAssignmentTaskDraft(draft)).toBeNull();
    expect(pmAssignmentTaskPayload(draft)).toEqual(expect.objectContaining({
      pmType: 'fbm',
      frequencyType: 'meter',
      value: 250,
      unit: null,
      assetMeterId: 'meter-1',
      nextDueDate: null,
    }));
  });
});
