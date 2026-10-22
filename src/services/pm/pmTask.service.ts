import type { PmTask } from '@prisma/client';
import { db } from '@/lib/db';
import { PmTaskBatchValidationError, normalizePmTaskDraft, validatePmTaskBatch, type PmTaskDraft } from '@/lib/pm-task';
export type PmTaskBatchSource = 'single' | 'bulk' | 'import';
export interface CreatePmTaskBatchInput { plantId: string; userId: string; rows: PmTaskDraft[]; source: PmTaskBatchSource; filename?: string; }

export async function createPmTaskBatch(input: CreatePmTaskBatchInput): Promise<PmTask[]> {
  const validation = validatePmTaskBatch(input.rows);
  if (validation.rowErrors.length > 0) throw new PmTaskBatchValidationError(validation.rowErrors);
  return db.$transaction(async (tx) => {
    const lockKey = `iassetspro:pm-task-number:${input.plantId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const current = await tx.pmTask.aggregate({ where: { plantId: input.plantId }, _max: { taskNumber: true } });
    const firstTaskNumber = (current._max.taskNumber ?? 0) + 1;
    const created = await tx.pmTask.createManyAndReturn({ data: validation.rows.map((row, index) => ({
      plantId: input.plantId, taskNumber: firstTaskNumber + index, description: row.description, taskType: row.taskType, createdById: input.userId,
    })) });
    if (created.length > 0) {
      await tx.auditLog.createMany({ data: created.map((task) => ({
        userId: input.userId, action: 'create', entityType: 'pm_task', entityId: task.id, plantId: input.plantId,
        newValues: JSON.stringify({ taskNumber: task.taskNumber, description: task.description, taskType: task.taskType, isActive: task.isActive, source: input.source }),
      })) });
    }
    if (input.source === 'bulk' || input.source === 'import') {
      await tx.auditLog.create({ data: {
        userId: input.userId, action: 'create', entityType: 'pm_task_batch', plantId: input.plantId,
        newValues: JSON.stringify({ source: input.source, filename: input.filename ?? null, rowCount: created.length, createdTaskIds: created.map((task) => task.id) }),
      } });
    }
    return created;
  });
}
export interface UpdatePmTaskInput { taskId: string; plantId: string; userId: string; patch: { description?: string; taskType?: string; isActive?: boolean }; }
export async function updatePmTask(input: UpdatePmTaskInput): Promise<PmTask> {
  return db.$transaction(async (tx) => {
    const existing = await tx.pmTask.findUnique({ where: { id: input.taskId } });
    if (!existing || existing.plantId !== input.plantId) throw new Error('PM task not found');
    const data: { description?: string; taskType?: string; isActive?: boolean } = {};
    if (input.patch.description !== undefined || input.patch.taskType !== undefined) {
      const normalized = normalizePmTaskDraft({ description: input.patch.description ?? existing.description, taskType: input.patch.taskType ?? existing.taskType });
      if (input.patch.description !== undefined) data.description = normalized.description;
      if (input.patch.taskType !== undefined) data.taskType = normalized.taskType;
    }
    if (input.patch.isActive !== undefined) data.isActive = input.patch.isActive;
    if (Object.keys(data).length === 0) throw new Error('No PM task changes were provided');
    const updated = await tx.pmTask.update({ where: { id: input.taskId }, data });
    await tx.auditLog.create({ data: {
      userId: input.userId, action: 'update', entityType: 'pm_task', entityId: updated.id, plantId: input.plantId,
      oldValues: JSON.stringify({ description: existing.description, taskType: existing.taskType, isActive: existing.isActive }),
      newValues: JSON.stringify({ description: updated.description, taskType: updated.taskType, isActive: updated.isActive }),
    } });
    return updated;
  });
}
export async function deactivatePmTask(input: Omit<UpdatePmTaskInput, 'patch'>): Promise<PmTask> {
  return db.$transaction(async (tx) => {
    const existing = await tx.pmTask.findUnique({ where: { id: input.taskId } });
    if (!existing || existing.plantId !== input.plantId) throw new Error('PM task not found');
    const updated = await tx.pmTask.update({ where: { id: input.taskId }, data: { isActive: false } });
    await tx.auditLog.create({ data: {
      userId: input.userId, action: 'deactivate', entityType: 'pm_task', entityId: updated.id, plantId: input.plantId,
      oldValues: JSON.stringify({ isActive: existing.isActive }), newValues: JSON.stringify({ isActive: updated.isActive }),
    } });
    return updated;
  });
}
