import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, tx } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    pmTask: {
      aggregate: vi.fn(),
      createManyAndReturn: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  };
  const mockDb = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { mockDb, tx };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { createPmTaskBatch, deactivatePmTask, updatePmTask } from '@/services/pm/pmTask.service';

const createdTask = (taskNumber: number, description = 'Inspect bearing', taskType = 'mechanical') => ({
  id: `task-${taskNumber}`,
  plantId: 'plant-1',
  taskNumber,
  description,
  taskType,
  isActive: true,
  createdById: 'user-1',
  createdAt: new Date('2026-10-22T00:00:00Z'),
  updatedAt: new Date('2026-10-22T00:00:00Z'),
});

describe('pmTask.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(0);
    tx.pmTask.aggregate.mockResolvedValue({ _max: { taskNumber: 17 } });
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    tx.auditLog.createMany.mockResolvedValue({ count: 0 });
  });

  it('rejects invalid rows before opening a transaction', async () => {
    await expect(createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'single',
      rows: [{ description: '', taskType: 'mechanical' }],
    })).rejects.toThrow();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('locks the plant number sequence before reading max and assigns contiguous server numbers', async () => {
    const order: string[] = [];
    tx.$executeRaw.mockImplementation(async () => { order.push('lock'); return 0; });
    tx.pmTask.aggregate.mockImplementation(async () => { order.push('aggregate'); return { _max: { taskNumber: 17 } }; });
    tx.pmTask.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      order.push('create');
      return data.map((row) => createdTask(Number(row.taskNumber), String(row.description), String(row.taskType)));
    });

    const result = await createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'bulk',
      rows: [
        { description: 'Inspect bearing', taskType: 'Mechanical' },
        { description: 'Check motor', taskType: ' ELECTRICAL ' },
      ],
    });

    expect(order.slice(0, 3)).toEqual(['lock', 'aggregate', 'create']);
    expect(result.map((task) => task.taskNumber)).toEqual([18, 19]);
    const createArg = tx.pmTask.createManyAndReturn.mock.calls[0][0];
    expect(createArg.data.map((row: { taskNumber: number }) => row.taskNumber)).toEqual([18, 19]);
  });

  it('never trusts a browser supplied taskNumber or plant ownership field', async () => {
    tx.pmTask.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) =>
      data.map((row) => createdTask(Number(row.taskNumber), String(row.description), String(row.taskType))));

    await createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'single',
      rows: [{ description: 'Inspect bearing', taskType: 'mechanical', taskNumber: 999, plantId: 'plant-evil' } as never],
    });

    expect(tx.pmTask.createManyAndReturn).toHaveBeenCalledWith({ data: [{
      plantId: 'plant-1', taskNumber: 18, description: 'Inspect bearing', taskType: 'mechanical', createdById: 'user-1',
    }] });
  });

  it('batches per-task audit rows and keeps the batch summary in the same transaction', async () => {
    tx.pmTask.createManyAndReturn.mockResolvedValue([createdTask(18), createdTask(19, 'Check motor', 'electrical')]);

    await createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'import', filename: 'tasks.xlsx',
      rows: [
        { description: 'Inspect bearing', taskType: 'mechanical' },
        { description: 'Check motor', taskType: 'electrical' },
      ],
    });

    expect(tx.auditLog.createMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0][0].data.entityType).toBe('pm_task_batch');
    expect(tx.auditLog.create.mock.calls[0][0].data.newValues).toContain('tasks.xlsx');
  });

  it('does not write audit records when task creation fails', async () => {
    tx.pmTask.createManyAndReturn.mockRejectedValue(new Error('database write failed'));
    await expect(createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'bulk',
      rows: [{ description: 'Inspect bearing', taskType: 'mechanical' }],
    })).rejects.toThrow('database write failed');
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('normalizes updates and audits the before/after values', async () => {
    tx.pmTask.findUnique.mockResolvedValue(createdTask(18));
    tx.pmTask.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...createdTask(18), ...data }));
    const result = await updatePmTask({
      taskId: 'task-18', plantId: 'plant-1', userId: 'user-1',
      patch: { description: '  Check coupling  ', taskType: ' ELECTRICAL ' },
    });
    expect(result.description).toBe('Check coupling');
    expect(result.taskType).toBe('electrical');
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('soft-deactivates and audits without deleting the task', async () => {
    tx.pmTask.findUnique.mockResolvedValue(createdTask(18));
    tx.pmTask.update.mockResolvedValue({ ...createdTask(18), isActive: false });
    const result = await deactivatePmTask({ taskId: 'task-18', plantId: 'plant-1', userId: 'user-1' });
    expect(result.isActive).toBe(false);
    expect(tx.pmTask.update).toHaveBeenCalledWith({ where: { id: 'task-18' }, data: { isActive: false } });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('deactivate');
  });
});
