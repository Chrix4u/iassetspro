import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
      equipmentState: 'stopped', frequencyInterval: '1', frequencyUnit: 'months',
    }));
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
    const master = { id: 'task-1', taskNumber: 1, description: 'Inspect', taskType: 'mechanical', isActive: true };
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
    expect(cardSource).toContain('TBM');
    expect(cardSource).toContain('UBM');
    expect(cardSource).toContain('CBM');
    expect(cardSource).toContain('RUNNING');
    expect(cardSource).toContain('STOPPED');
    expect(cardSource).toContain('Estimated Minutes');
    expect(cardSource).toContain('Lead Days');
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
