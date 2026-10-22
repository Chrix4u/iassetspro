import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, tx } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    pmTemplate: { findUnique: vi.fn() },
    pmSchedule: { findFirst: vi.fn() },
    pmTask: {
      aggregate: vi.fn(),
      createManyAndReturn: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    pmTemplateTask: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
  };
  const mockDb = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { mockDb, tx };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  createAndLinkPmTasks,
  convertLegacyPmTemplateTask,
  deactivatePmTemplateTask,
  linkPmTasksToTemplate,
  reorderPmTemplateTasks,
} from '@/services/pm/pmTemplateTaskAssociation.service';

const stamp = new Date('2026-10-22T00:00:00Z');
const master = (id: string, taskNumber: number, taskType = 'mechanical', plantId = 'plant-1') => ({
  id, plantId, taskNumber, description: `Master ${id}`, taskType, isActive: true,
  createdById: 'user-1', createdAt: stamp, updatedAt: stamp,
});
const association = (overrides: Record<string, unknown> = {}) => ({
  id: 'assoc-1', templateId: 'template-1', pmTaskId: 'task-1', taskNumber: 7,
  description: 'Compatibility description', taskType: 'check', requiredParts: null,
  estimatedMinutes: null, sortOrder: 0, isActive: true, ...overrides,
});

function template(plantId: string | null = 'plant-1') {
  return { id: 'template-1', plantId, isActive: true };
}

describe('pmTemplateTaskAssociation.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(0);
    tx.$executeRawUnsafe.mockResolvedValue(0);
    tx.pmTemplate.findUnique.mockResolvedValue(template());
    tx.pmSchedule.findFirst.mockResolvedValue(null);
    tx.pmTemplateTask.count.mockResolvedValue(2);
    tx.pmTask.aggregate.mockResolvedValue({ _max: { taskNumber: 20 } });
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    tx.auditLog.createMany.mockResolvedValue({ count: 0 });
    tx.pmTemplateTask.findMany.mockResolvedValue([]);
    tx.pmTemplateTask.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects duplicate Task Master ids before opening a transaction', async () => {
    await expect(linkPmTasksToTemplate({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1', pmTaskIds: ['task-1', 'task-1'],
    })).rejects.toThrow(/duplicate/i);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('rejects missing, inactive, or cross-plant Task Masters before association writes', async () => {
    tx.pmTask.findMany.mockResolvedValue([master('task-1', 3)]);

    await expect(linkPmTasksToTemplate({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1', pmTaskIds: ['task-1', 'task-evil'],
    })).rejects.toThrow(/same plant|unavailable|active/i);

    expect(tx.pmTemplateTask.create).not.toHaveBeenCalled();
    expect(tx.pmTemplateTask.update).not.toHaveBeenCalled();
  });

  it('does not duplicate an already-active association and creates new compatibility rows from master data', async () => {
    const first = master('task-1', 3, 'electrical');
    const second = master('task-2', 9, 'lubrication');
    tx.pmTask.findMany.mockResolvedValue([first, second]);
    tx.pmTemplateTask.findMany.mockResolvedValue([
      association({ id: 'assoc-existing', pmTaskId: 'task-1', taskNumber: 7, sortOrder: 2, isActive: true }),
    ]);
    tx.pmTemplateTask.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => association({ id: 'assoc-new', ...data }));

    const result = await linkPmTasksToTemplate({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1', pmTaskIds: ['task-1', 'task-2'],
    });

    expect(tx.pmTemplateTask.create).toHaveBeenCalledTimes(1);
    expect(tx.pmTemplateTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      templateId: 'template-1', pmTaskId: 'task-2', taskNumber: 8, sortOrder: 3,
      description: second.description, taskType: 'check', requiredParts: null, estimatedMinutes: null,
    }) });
    expect(tx.pmTask.update).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });

  it('reactivates an inactive association at the end without changing its compatibility task number', async () => {
    const task = master('task-1', 3);
    const inactive = association({ taskNumber: 4, sortOrder: 1, isActive: false });
    const other = association({ id: 'assoc-2', pmTaskId: 'task-2', taskNumber: 8, sortOrder: 6, isActive: true });
    tx.pmTask.findMany.mockResolvedValue([task]);
    tx.pmTemplateTask.findMany.mockResolvedValue([inactive, other]);
    tx.pmTemplateTask.update.mockResolvedValue({ ...inactive, isActive: true, sortOrder: 7 });

    await linkPmTasksToTemplate({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1', pmTaskIds: ['task-1'],
    });

    expect(tx.pmTemplateTask.update).toHaveBeenCalledWith({
      where: { id: 'assoc-1' }, data: { isActive: true, sortOrder: 7 },
    });
    expect(tx.pmTemplateTask.update.mock.calls[0][0].data).not.toHaveProperty('taskNumber');
  });

  it('creates Task Masters and associations in one transaction using canonical numbering and compatibility defaults', async () => {
    tx.pmTask.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) =>
      data.map((row, index) => master(`new-${index + 1}`, Number(row.taskNumber), String(row.taskType))));
    tx.pmTemplateTask.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => association({ id: `assoc-${String(data.pmTaskId)}`, ...data }));

    const result = await createAndLinkPmTasks({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1',
      rows: [
        { description: 'Inspect coupling', taskType: 'Mechanical' },
        { description: 'Test insulation', taskType: 'Electrical' },
      ],
    });

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.pmTask.createManyAndReturn.mock.calls[0][0].data.map((row: { taskNumber: number }) => row.taskNumber)).toEqual([21, 22]);
    expect(tx.pmTemplateTask.create).toHaveBeenCalledTimes(2);
    for (const call of tx.pmTemplateTask.create.mock.calls) {
      expect(call[0].data).toEqual(expect.objectContaining({ taskType: 'check', requiredParts: null, estimatedMinutes: null }));
    }
    expect(result).toHaveLength(2);
  });

  it('requires reorder to contain the exact active association set and only changes sortOrder', async () => {
    tx.pmTemplateTask.findMany.mockResolvedValue([
      association({ id: 'assoc-1', pmTaskId: 'task-1', sortOrder: 0 }),
      association({ id: 'assoc-2', pmTaskId: 'task-2', taskNumber: 11, sortOrder: 1 }),
    ]);

    await expect(reorderPmTemplateTasks({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1', associationIds: ['assoc-1'],
    })).rejects.toThrow(/every active|exact/i);
    expect(tx.pmTemplateTask.updateMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    tx.$executeRawUnsafe.mockResolvedValue(0);
    tx.pmTemplate.findUnique.mockResolvedValue(template());
    tx.pmTemplateTask.findMany.mockResolvedValue([
      association({ id: 'assoc-1', pmTaskId: 'task-1', sortOrder: 0 }),
      association({ id: 'assoc-2', pmTaskId: 'task-2', taskNumber: 11, sortOrder: 1 }),
    ]);
    tx.pmTemplateTask.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    await reorderPmTemplateTasks({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1', associationIds: ['assoc-2', 'assoc-1'],
    });
    expect(tx.pmTemplateTask.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'assoc-2', templateId: 'template-1', isActive: true }, data: { sortOrder: 0 },
    });
    expect(tx.pmTemplateTask.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'assoc-1', templateId: 'template-1', isActive: true }, data: { sortOrder: 1 },
    });
    expect(tx.pmTask.update).not.toHaveBeenCalled();
  });

  it('atomically blocks removal of the final active task when an active schedule uses the template', async () => {
    tx.pmTemplateTask.findMany.mockResolvedValue([association()]);
    tx.pmSchedule.findFirst.mockResolvedValue({ id: 'schedule-1', title: 'Pump monthly PM' });
    tx.pmTemplateTask.count.mockResolvedValue(1);

    await expect(deactivatePmTemplateTask({
      templateId: 'template-1', associationId: 'assoc-1', plantId: 'plant-1', userId: 'user-1',
    })).rejects.toThrow(/last active task/i);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      'iassetspro:pm-template-task-order:template-1',
    );
    expect(tx.pmSchedule.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { templateId: 'template-1', isActive: true },
    }));
    expect(tx.pmTemplateTask.count).toHaveBeenCalledWith({ where: { templateId: 'template-1', isActive: true } });
    expect(tx.pmTemplateTask.update).not.toHaveBeenCalled();
  });

  it('soft-removes an association without deactivating or deleting its Task Master', async () => {
    tx.pmTemplateTask.findMany.mockResolvedValue([association()]);
    tx.pmTemplateTask.update.mockResolvedValue({ ...association(), isActive: false });

    await deactivatePmTemplateTask({
      templateId: 'template-1', associationId: 'assoc-1', plantId: 'plant-1', userId: 'user-1',
    });

    expect(tx.pmTemplateTask.update).toHaveBeenCalledWith({ where: { id: 'assoc-1' }, data: { isActive: false } });
    expect(tx.pmTask.update).not.toHaveBeenCalled();
  });

  it('converts one legacy association into exactly one master while preserving association identity and order', async () => {
    const legacy = association({ pmTaskId: null, taskNumber: 2, sortOrder: 5, description: 'Legacy grease bearing', taskType: 'lubricate' });
    tx.pmTemplateTask.findMany.mockResolvedValue([legacy]);
    tx.pmTask.createManyAndReturn.mockResolvedValue([master('master-new', 21, 'lubrication')]);
    tx.pmTemplateTask.update.mockResolvedValue({ ...legacy, pmTaskId: 'master-new' });

    const result = await convertLegacyPmTemplateTask({
      templateId: 'template-1', associationId: 'assoc-1', plantId: 'plant-1', userId: 'user-1', taskType: 'lubrication',
    });

    expect(tx.pmTask.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(tx.pmTask.createManyAndReturn.mock.calls[0][0].data).toHaveLength(1);
    expect(tx.pmTemplateTask.update).toHaveBeenCalledWith({ where: { id: 'assoc-1' }, data: { pmTaskId: 'master-new' } });
    expect(tx.pmTemplateTask.update.mock.calls[0][0].data).not.toHaveProperty('sortOrder');
    expect(tx.pmTemplateTask.update.mock.calls[0][0].data).not.toHaveProperty('taskNumber');
    expect(result.id).toBe('assoc-1');
  });

  it('refuses legacy conversion when the template has no plant owner', async () => {
    tx.pmTemplate.findUnique.mockResolvedValue(template(null));

    await expect(convertLegacyPmTemplateTask({
      templateId: 'template-1', associationId: 'assoc-1', plantId: 'plant-1', userId: 'user-1', taskType: 'mechanical',
    })).rejects.toThrow(/plant|unowned/i);
    expect(tx.pmTask.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('writes association audit events through the same transaction client', async () => {
    tx.pmTask.findMany.mockResolvedValue([master('task-1', 3)]);
    tx.pmTemplateTask.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => association({ ...data }));

    await linkPmTasksToTemplate({
      templateId: 'template-1', plantId: 'plant-1', userId: 'user-1', pmTaskIds: ['task-1'],
    });

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'user-1', entityType: 'pm_template_task', plantId: 'plant-1',
    }) });
  });
});
