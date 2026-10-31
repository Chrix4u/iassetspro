import { deactivatePmAssignmentTarget, replacePmAssignmentTarget } from '@/services/pm/pmAssignment.service';

const taskInput = (id?: string, value = 30) => ({
  ...(id ? { id } : {}), pmTaskId: id === 'assignment-2' ? 'task-2' : 'task-1',
  pmType: 'tbm', activityMode: 'inspection', inspectionType: 'standstill', value, unit: 'days',
  nextDueDate: '2026-11-26', estimatedMinutes: 20, leadDays: 2,
});

function harness() {
  const tx = {
    asset: { findUnique: vi.fn().mockResolvedValue({ id: 'asset-1', plantId: 'plant-1' }) },
    componentRegistry: { findUnique: vi.fn().mockResolvedValue({ id: 'component-1', assetId: 'asset-1' }) },
    pmTask: { findUnique: vi.fn().mockImplementation(async ({ where }: any) => ({ id: where.id, plantId: 'plant-1', isActive: true })) },
    assetMeter: { findUnique: vi.fn() },
    pmScheduleTask: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'assignment-1', assetId: 'asset-1', componentId: 'component-1', pmTaskId: 'task-1', pmType: 'tbm', isActive: true },
        { id: 'assignment-2', assetId: 'asset-1', componentId: 'component-1', pmTaskId: 'task-2', pmType: 'tbm', isActive: true },
      ]),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'assignment-new', ...data })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const host = { $transaction: vi.fn(async (callback: any) => callback(tx)) };
  return { tx, host };
}

describe('PM assignment target mutations', () => {
  it('atomically updates retained rows, creates new rows and deactivates omitted rows', async () => {
    const { tx, host } = harness();
    const result = await replacePmAssignmentTarget(host as never, {
      plantId: 'plant-1', actorId: 'planner-1', assetId: 'asset-1', componentId: 'component-1',
      assignments: [taskInput('assignment-1', 60), taskInput(undefined, 90)],
    });
    expect(host.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({ where: { id: 'assignment-1' }, data: expect.objectContaining({ frequencyInterval: 60, isActive: true }) });
    expect(tx.pmScheduleTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ assetId: 'asset-1', componentId: 'component-1', frequencyInterval: 90 }) });
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({ where: { id: 'assignment-2' }, data: { isActive: false } });
  });

  it('rejects an assignment id that does not belong to the selected target', async () => {
    const { host } = harness();
    await expect(replacePmAssignmentTarget(host as never, {
      plantId: 'plant-1', actorId: 'planner-1', assetId: 'asset-1', componentId: 'component-1',
      assignments: [taskInput('assignment-foreign')],
    })).rejects.toThrow(/does not belong to this PM target/i);
  });

  it('deactivates every active row on a target in one transaction and audits each row', async () => {
    const { tx, host } = harness();
    const result = await deactivatePmAssignmentTarget(host as never, {
      plantId: 'plant-1', actorId: 'planner-1', assetId: 'asset-1', componentId: 'component-1',
    });
    expect(result).toEqual({ count: 2 });
    expect(tx.pmScheduleTask.update).toHaveBeenCalledTimes(2);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });
});
