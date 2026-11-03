import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePmAssignmentInput } from '@/services/pm/pmAssignment.service';
import { evaluateScheduledTaskDue } from '@/services/pm/pmScheduledTaskDueEngine';
import { advanceClosedPmScheduledTaskRecurrence } from '@/services/pm/advancePmScheduledTaskRecurrence.service';

const baseAssignment = {
  assetId: 'asset-1',
  pmTaskId: 'task-1',
  pmType: 'tbm',
  activityMode: 'inspection',
  inspectionType: 'standstill',
  frequencyType: 'time_day',
  value: 14,
  unit: 'days',
  nextDueDate: '2026-11-17',
  estimatedMinutes: 20,
  leadDays: 2,
};

function scheduledTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'direct-1',
    scheduleId: null,
    assetId: 'asset-1',
    componentId: null,
    pmTaskId: 'task-1',
    sortOrder: 0,
    pmType: 'cbm',
    maintenanceMode: 'cbm',
    basis: 'calendar',
    recurrenceBasis: 'after_completion',
    recurrenceAnchorDate: null,
    activityMode: 'inspection',
    equipmentState: 'standstill',
    estimatedMinutes: 20,
    leadDays: 0,
    frequencyInterval: 14,
    frequencyUnit: 'days',
    meterName: null,
    assetMeterId: null,
    nextDueReading: null,
    conditionSourceType: null,
    conditionSourceId: null,
    conditionMetric: null,
    conditionOperator: null,
    conditionThreshold: null,
    conditionThresholdMax: null,
    conditionUnit: null,
    evaluationCadenceMinutes: null,
    lastCompletedAt: null,
    lastEvaluatedAt: null,
    lastGeneratedAt: null,
    lastGeneratedCycleKey: null,
    nextDueDate: new Date('2026-11-03T10:00:00.000Z'),
    isActive: true,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('direct PM frequency independence', () => {
  it('normalizes calendar frequency independently from CBM classification', () => {
    const result = normalizePmAssignmentInput({ ...baseAssignment, pmType: 'cbm', frequencyType: 'time_day' });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        pmType: 'cbm',
        basis: 'calendar',
        value: 14,
        unit: 'days',
        nextDueDate: new Date('2026-11-17'),
      }),
    }));
  });

  it('normalizes meter frequency independently from FBM classification', () => {
    const result = normalizePmAssignmentInput({
      ...baseAssignment,
      pmType: 'fbm',
      frequencyType: 'meter',
      value: 250,
      unit: null,
      assetMeterId: 'meter-1',
      nextDueDate: null,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        pmType: 'fbm',
        basis: 'meter',
        value: 250,
        assetMeterId: 'meter-1',
        nextDueDate: null,
      }),
    }));
  });

  it('preserves an event frequency independently from TBM classification', () => {
    const result = normalizePmAssignmentInput({
      ...baseAssignment,
      pmType: 'tbm',
      frequencyType: 'event',
      value: null,
      unit: null,
      nextDueDate: null,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({ pmType: 'tbm', basis: null, value: null, unit: null, nextDueDate: null }),
    }));
  });

  it('uses calendar basis for a direct CBM task instead of forcing condition evaluation', async () => {
    const client = {
      assetMeter: { findUnique: vi.fn() },
      meterReading: { findFirst: vi.fn() },
      componentConditionReading: { findFirst: vi.fn() },
      iotDevice: { findUnique: vi.fn() },
      pmScheduleTask: { update: vi.fn() },
    };
    const result = await evaluateScheduledTaskDue({
      client: client as never,
      task: scheduledTask({ maintenanceMode: 'cbm', basis: 'calendar' }) as never,
      assetId: 'asset-1',
      plantId: 'plant-1',
      componentId: null,
      now: new Date('2026-11-03T12:00:00.000Z'),
    });
    expect(result).toMatchObject({ due: true, maintenanceMode: 'cbm' });
    expect(client.componentConditionReading.findFirst).not.toHaveBeenCalled();
  });

  it('uses meter basis for a direct FBM task instead of forcing failure-event waiting', async () => {
    const client = {
      assetMeter: { findUnique: vi.fn().mockResolvedValue({
        id: 'meter-1', assetId: 'asset-1', name: 'Running Hours', unit: 'h', currentValue: 1250,
        lastReadingAt: new Date('2026-11-03T11:00:00.000Z'), isActive: true,
      }) },
      meterReading: { findFirst: vi.fn() },
      componentConditionReading: { findFirst: vi.fn() },
      iotDevice: { findUnique: vi.fn() },
      pmScheduleTask: { update: vi.fn() },
    };
    const result = await evaluateScheduledTaskDue({
      client: client as never,
      task: scheduledTask({
        maintenanceMode: 'fbm', pmType: 'fbm', basis: 'meter', frequencyInterval: 250,
        frequencyUnit: 'h', meterName: 'Running Hours', assetMeterId: 'meter-1', nextDueReading: 1250, nextDueDate: null,
      }) as never,
      assetId: 'asset-1',
      plantId: 'plant-1',
      componentId: null,
      now: new Date('2026-11-03T12:00:00.000Z'),
    });
    expect(result).toMatchObject({ due: true, maintenanceMode: 'fbm', currentValue: 1250 });
    expect(client.assetMeter.findUnique).toHaveBeenCalled();
  });

  it('advances direct calendar recurrence by basis even when PM Type is CBM', async () => {
    const completedAt = new Date('2026-11-03T10:30:00.000Z');
    const tx = {
      pmSchedule: { findUnique: vi.fn() },
      workOrderTaskExecution: { findMany: vi.fn() },
      pmScheduleTask: { update: vi.fn().mockResolvedValue({ id: 'direct-1' }) },
      assetMeter: { findUnique: vi.fn() },
      meterReading: { findFirst: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    tx.workOrderTaskExecution.findMany.mockResolvedValue([{
      id: 'execution-1', status: 'completed', completedAt, pmScheduleTaskId: 'direct-1',
      pmDueCycleKey: 'tbm:direct-1:2026-11-03T10:00:00.000Z', pmPlanningSnapshot: '{}',
      pmScheduleTask: scheduledTask({ maintenanceMode: 'cbm', basis: 'calendar', frequencyInterval: 14, frequencyUnit: 'days' }),
    }]);

    await advanceClosedPmScheduledTaskRecurrence({
      tx: tx as never,
      workOrderId: 'wo-1',
      pmScheduleId: null,
      assetId: 'asset-1',
      woNumber: 'WO-1',
      woActualEnd: completedAt,
      closedAt: completedAt,
      actorId: 'planner-1',
    });

    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'direct-1' },
      data: { lastCompletedAt: completedAt, nextDueDate: new Date('2026-11-17T10:30:00.000Z') },
    });
  });

  it('keeps legacy schedule-backed CBM behavior maintenance-mode driven even if basis is populated', async () => {
    const client = {
      assetMeter: { findUnique: vi.fn() },
      meterReading: { findFirst: vi.fn() },
      componentConditionReading: { findFirst: vi.fn().mockResolvedValue({
        id: 'condition-1', value: 8, unit: 'mm/s', recordedAt: new Date('2026-11-03T11:30:00.000Z'),
      }) },
      iotDevice: { findUnique: vi.fn() },
      pmScheduleTask: { update: vi.fn() },
    };
    const result = await evaluateScheduledTaskDue({
      client: client as never,
      task: scheduledTask({
        scheduleId: 'legacy-schedule-1', maintenanceMode: 'cbm', basis: 'calendar', nextDueDate: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-1', conditionMetric: 'vibration',
        conditionOperator: '>=', conditionThreshold: 5, conditionUnit: 'mm/s',
      }) as never,
      assetId: 'asset-1',
      plantId: 'plant-1',
      componentId: 'component-1',
      now: new Date('2026-11-03T12:00:00.000Z'),
    });
    expect(result).toMatchObject({ due: true, reason: 'cbm_due', maintenanceMode: 'cbm' });
    expect(client.componentConditionReading.findFirst).toHaveBeenCalled();
  });
});
