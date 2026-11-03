import { describe, expect, it, vi } from 'vitest';
import { evaluateScheduledTaskDue } from '@/services/pm/pmScheduledTaskDueEngine';
import { advanceClosedPmScheduledTaskRecurrence } from '@/services/pm/advancePmScheduledTaskRecurrence.service';

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'direct-event-1', scheduleId: null, assetId: 'asset-1', componentId: null, pmTaskId: 'task-1', sortOrder: 0,
    pmType: 'tbm', maintenanceMode: 'tbm', basis: null, recurrenceBasis: 'after_completion', recurrenceAnchorDate: null,
    activityMode: 'inspection', equipmentState: 'standstill', estimatedMinutes: 10, leadDays: 0,
    frequencyInterval: null, frequencyUnit: null, meterName: null, assetMeterId: null, nextDueReading: null,
    conditionSourceType: null, conditionSourceId: null, conditionMetric: null, conditionOperator: null,
    conditionThreshold: null, conditionThresholdMax: null, conditionUnit: null, evaluationCadenceMinutes: null,
    lastCompletedAt: null, lastEvaluatedAt: null, lastGeneratedAt: null, lastGeneratedCycleKey: null,
    nextDueDate: null, isActive: true, createdAt: new Date('2026-11-01T00:00:00.000Z'), updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('event frequency independence', () => {
  it('does not turn direct TBM + event frequency back into calendar scheduling', async () => {
    const client = {
      assetMeter: { findUnique: vi.fn() }, meterReading: { findFirst: vi.fn() }, componentConditionReading: { findFirst: vi.fn() },
      iotDevice: { findUnique: vi.fn() }, pmScheduleTask: { update: vi.fn() },
    };
    const result = await evaluateScheduledTaskDue({
      client: client as never,
      task: task({ pmType: 'tbm', maintenanceMode: 'tbm', basis: null, nextDueDate: new Date('2026-11-01T00:00:00.000Z') }) as never,
      assetId: 'asset-1', plantId: 'plant-1', componentId: null, now: new Date('2026-11-03T12:00:00.000Z'),
    });
    expect(result).toMatchObject({ due: false, reason: 'event_waiting_for_signal', maintenanceMode: 'tbm' });
  });

  it('does not turn direct UBM + event frequency back into meter recurrence on completion', async () => {
    const completedAt = new Date('2026-11-03T10:30:00.000Z');
    const tx = {
      pmSchedule: { findUnique: vi.fn() },
      workOrderTaskExecution: { findMany: vi.fn().mockResolvedValue([{
        id: 'execution-1', status: 'completed', completedAt, pmScheduleTaskId: 'direct-event-1',
        pmDueCycleKey: 'event:direct-event-1:initial', pmPlanningSnapshot: '{}',
        pmScheduleTask: task({ pmType: 'ubm', maintenanceMode: 'ubm', basis: null }),
      }]) },
      pmScheduleTask: { update: vi.fn().mockResolvedValue({ id: 'direct-event-1' }) },
      assetMeter: { findUnique: vi.fn() }, meterReading: { findFirst: vi.fn() }, auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    await advanceClosedPmScheduledTaskRecurrence({
      tx: tx as never, workOrderId: 'wo-1', pmScheduleId: null, assetId: 'asset-1', woNumber: 'WO-1',
      woActualEnd: completedAt, closedAt: completedAt, actorId: 'planner-1',
    });

    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({ where: { id: 'direct-event-1' }, data: { lastCompletedAt: completedAt } });
    expect(tx.meterReading.findFirst).not.toHaveBeenCalled();
    expect(tx.assetMeter.findUnique).not.toHaveBeenCalled();
  });
});
