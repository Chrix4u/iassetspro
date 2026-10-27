import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pmScheduleTaskHelpers from '@/lib/pm-schedule-task';
import {
  PM_SCHEDULE_TASK_TIME_UNITS,
  formatPmScheduleTaskPlanningSummary,
  pmScheduleTaskDraftFromApi,
  pmScheduleTaskDraftFromMaster,
  pmScheduleTaskPayload,
} from '@/lib/pm-schedule-task';

const cardSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmScheduleTaskCard.tsx'), 'utf8');
const plannerSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmScheduleTaskPlanner.tsx'), 'utf8');
const pickerSource = readFileSync(resolve(process.cwd(), 'src/components/modules/pm/PmScheduleTaskPickerDialog.tsx'), 'utf8');

describe('PM scheduled-task UI contract', () => {
  it('creates a schedule draft from an immutable Task Master identity', () => {
    expect(pmScheduleTaskDraftFromMaster({
      id: 'task-17', taskNumber: 17, description: 'Inspect drive coupling', taskType: 'mechanical', isActive: true,
    })).toEqual(expect.objectContaining({
      clientId: 'task-17', id: null, pmTaskId: 'task-17', taskNumber: 17,
      description: 'Inspect drive coupling', taskType: 'mechanical', maintenanceMode: 'tbm',
      equipmentState: 'stopped', frequencyType: 'time_day', frequencyInterval: '1', frequencyUnit: 'months',
    }));
  });

  it('offers the complete time/day unit set needed by task recurrence planning', () => {
    expect(PM_SCHEDULE_TASK_TIME_UNITS).toEqual(['minutes', 'hours', 'days', 'weeks', 'months', 'years']);
  });

  it('totals task estimated minutes for a compact schedule summary and persisted duration', () => {
    const total = (pmScheduleTaskHelpers as any).totalPmScheduleEstimatedMinutes;
    expect(total).toBeTypeOf('function');
    const one = pmScheduleTaskDraftFromMaster({ id: 'task-1', taskNumber: 1, description: 'One', taskType: 'mechanical' });
    const two = pmScheduleTaskDraftFromMaster({ id: 'task-2', taskNumber: 2, description: 'Two', taskType: 'mechanical' });
    const three = pmScheduleTaskDraftFromMaster({ id: 'task-3', taskNumber: 3, description: 'Three', taskType: 'mechanical' });
    one.estimatedMinutes = '30';
    two.estimatedMinutes = '5';
    three.estimatedMinutes = '3';
    expect(total([one, two, three])).toBe(38);
    expect(total([{ ...one, estimatedMinutes: '' }, { ...two, estimatedMinutes: '-1' }, { ...three, estimatedMinutes: 'abc' }])).toBe(0);
  });

  it('maps persisted scheduled-task planning into editable string fields without changing Task Number', () => {
    const draft = pmScheduleTaskDraftFromApi({
      id: 'scheduled-1', pmTaskId: 'task-17', sortOrder: 2, maintenanceMode: 'ubm', equipmentState: 'running',
      estimatedMinutes: 25, leadDays: 3, frequencyInterval: 500, frequencyUnit: 'hours', meterName: 'Operating Hours',
      nextDueReading: 1750, isActive: true,
      pmTask: { id: 'task-17', taskNumber: 17, description: 'Inspect drive coupling', taskType: 'mechanical', isActive: true },
    });
    expect(draft).toEqual(expect.objectContaining({
      clientId: 'scheduled-1', id: 'scheduled-1', taskNumber: 17, maintenanceMode: 'ubm',
      equipmentState: 'running', estimatedMinutes: '25', leadDays: '3', frequencyInterval: '500',
      frequencyUnit: 'hours', meterName: 'Operating Hours', nextDueReading: '1750',
    }));
  });

  it('preserves time-of-day when an hourly or minute TBM task is reopened for editing', () => {
    const draft = pmScheduleTaskDraftFromApi({
      id: 'scheduled-hourly', pmTaskId: 'task-18', maintenanceMode: 'tbm', equipmentState: 'running',
      estimatedMinutes: 5, leadDays: 0, frequencyInterval: 2, frequencyUnit: 'hours',
      nextDueDate: '2026-10-31T14:30:00.000Z', isActive: true,
      pmTask: { id: 'task-18', taskNumber: 18, description: 'Check pressure', taskType: 'mechanical', isActive: true },
    });
    expect(draft.nextDueDate).toBe('2026-10-31T14:30');
  });

  it('forces sub-day TBM lead days to zero and serializes the due time as an absolute instant', () => {
    const draft = pmScheduleTaskDraftFromApi({
      id: 'scheduled-hourly', pmTaskId: 'task-17', maintenanceMode: 'tbm', equipmentState: 'stopped',
      estimatedMinutes: 10, leadDays: 4, frequencyInterval: 3, frequencyUnit: 'hours',
      nextDueDate: '2026-10-27T03:30:00.000Z', isActive: true,
      pmTask: { id: 'task-17', taskNumber: 17, description: 'Grease bearing', taskType: 'lubrication', isActive: true },
    });
    expect(draft.leadDays).toBe('0');
    expect(draft.nextDueDate).toBe('2026-10-27T03:30');
    const payload = pmScheduleTaskPayload(draft, 0);
    expect(payload.leadDays).toBe(0);
    expect(typeof payload.nextDueDate).toBe('string');
    expect(payload.nextDueDate).toMatch(/Z$/);
    expect(new Date(payload.nextDueDate as string).getTime()).toBe(new Date('2026-10-27T03:30').getTime());
    expect(cardSource).toContain('Exact due time; no day lead.');
  });

  it('serializes only planning fields and clears metadata from inactive modes', () => {
    const tbm = pmScheduleTaskDraftFromMaster({
      id: 'task-1', taskNumber: 1, description: 'Inspect', taskType: 'mechanical', isActive: true,
    });
    tbm.estimatedMinutes = '20';
    tbm.leadDays = '2';
    tbm.frequencyInterval = '6';
    tbm.frequencyUnit = 'months';
    tbm.nextDueDate = '2026-12-01';
    tbm.meterName = 'Should clear';
    tbm.conditionThreshold = '99';

    expect(pmScheduleTaskPayload(tbm, 4)).toEqual({
      pmTaskId: 'task-1', sortOrder: 4, maintenanceMode: 'tbm', equipmentState: 'stopped',
      estimatedMinutes: 20, leadDays: 2, frequencyInterval: 6, frequencyUnit: 'months',
      meterName: null, nextDueReading: null, nextDueDate: '2026-12-01',
      conditionSourceType: null, conditionSourceId: null, conditionMetric: null, conditionOperator: null,
      conditionThreshold: null, conditionThresholdMax: null, conditionUnit: null, evaluationCadenceMinutes: null,
      isActive: true,
    });
  });

  it('formats planner-readable TBM, UBM and CBM summaries', () => {
    const master = { id: 'task-1', taskNumber: 1, description: 'Inspect', taskType: 'mechanical' as const, isActive: true };
    const tbm = pmScheduleTaskDraftFromMaster(master);
    tbm.frequencyInterval = '2'; tbm.frequencyUnit = 'weeks'; tbm.nextDueDate = '2026-11-09';
    expect(formatPmScheduleTaskPlanningSummary(tbm)).toContain('Every 2 weeks');

    const ubm = { ...tbm, maintenanceMode: 'ubm' as const, meterName: 'Operating Hours', frequencyInterval: '500', frequencyUnit: 'hours', nextDueReading: '1750' };
    expect(formatPmScheduleTaskPlanningSummary(ubm)).toContain('1750');

    const cbm = { ...tbm, maintenanceMode: 'cbm' as const, conditionMetric: 'Temperature', conditionOperator: 'outside_range' as const, conditionThreshold: '50', conditionThresholdMax: '80', conditionUnit: '°C' };
    expect(formatPmScheduleTaskPlanningSummary(cbm)).toContain('50–80 °C');
  });

  it('renders mode-specific planning, execution-state and accessible reorder controls on every task card', () => {
    expect(cardSource).toContain('Task #');
    expect(cardSource).toContain('Time Based');
    expect(cardSource).toContain('Usage Based');
    expect(cardSource).toContain('Condition Based');
    expect(cardSource).toContain('Running');
    expect(cardSource).toContain('Stopped');
    expect(cardSource).toContain('Frequency Type');
    expect(cardSource).toContain('Frequency Unit');
    expect(cardSource).toContain('Value / Interval');
    expect(cardSource).toContain('Inspection Type');
    expect(cardSource).toContain('Maintenance Mode');
    expect(cardSource).toContain('Est. Minutes');
    expect(cardSource).toContain('Lead Days');
    expect(cardSource).toContain('Next Due Date');
    expect(cardSource).not.toContain('<Label>Equipment State</Label>');
    expect(cardSource).toContain('outside_range');
    expect(cardSource).toContain('Move Task #');
    expect(cardSource).toContain('Remove Task #');
  });

  it('loads Task Library, meter and condition authorities instead of free-text task definitions', () => {
    expect(pickerSource).toContain('/api/pm-tasks?');
    expect(pickerSource).toContain('Task #');
    expect(plannerSource).toContain('Add Task from Library');
    expect(plannerSource).toContain('/api/pm-schedules/meter-sources?assetId=');
    expect(plannerSource).toContain('/api/pm-schedules/condition-sources?');
    expect(plannerSource).not.toContain('requiredPartsText');
  });
});
