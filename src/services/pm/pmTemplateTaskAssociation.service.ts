import type { PmTask, PmTemplateTask, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { normalizePmTaskDraft, type PmTaskDraft, type PmTaskType } from '@/lib/pm-task';
import { createPmTaskBatchInTransaction } from '@/services/pm/pmTask.service';

type Tx = Prisma.TransactionClient;

interface TemplateMutationInput {
  templateId: string;
  plantId: string;
  userId: string;
}

export interface LinkPmTasksToTemplateInput extends TemplateMutationInput {
  pmTaskIds: string[];
}

export interface CreateAndLinkPmTasksInput extends TemplateMutationInput {
  rows: PmTaskDraft[];
}

export interface ReorderPmTemplateTasksInput extends TemplateMutationInput {
  associationIds: string[];
}

export interface DeactivatePmTemplateTaskInput extends TemplateMutationInput {
  associationId: string;
}

export interface ConvertLegacyPmTemplateTaskInput extends DeactivatePmTemplateTaskInput {
  taskType: PmTaskType;
}

async function lockTemplateOrder(tx: Tx, templateId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    `iassetspro:pm-template-task-order:${templateId}`,
  );
}

async function requireOwnedTemplate(tx: Tx, templateId: string, plantId: string) {
  const template = await tx.pmTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, plantId: true, isActive: true },
  });
  if (!template) throw new Error('PM template not found');
  if (!template.plantId) throw new Error('PM template is unowned and must be assigned to a plant first');
  if (template.plantId !== plantId) throw new Error('PM template does not belong to the selected plant');
  return template;
}

function assertUniqueIds(ids: string[], label: string): string[] {
  const normalized = ids.map((id) => String(id).trim()).filter(Boolean);
  if (normalized.length === 0) throw new Error(`${label} are required`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicate IDs`);
  return normalized;
}

async function loadTemplateAssociations(tx: Tx, templateId: string): Promise<PmTemplateTask[]> {
  return tx.pmTemplateTask.findMany({
    where: { templateId },
    orderBy: [{ sortOrder: 'asc' }, { taskNumber: 'asc' }, { id: 'asc' }],
  });
}

async function auditAssociationMutation(
  tx: Tx,
  input: TemplateMutationInput,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: input.userId,
      action,
      entityType: 'pm_template_task',
      entityId: input.templateId,
      plantId: input.plantId,
      newValues: JSON.stringify(details),
    },
  });
}

async function linkPmTasksInTransaction(
  tx: Tx,
  input: LinkPmTasksToTemplateInput,
  options: { lock?: boolean; templateChecked?: boolean; masters?: PmTask[] } = {},
): Promise<PmTemplateTask[]> {
  const pmTaskIds = assertUniqueIds(input.pmTaskIds, 'Task Master IDs');
  if (options.lock !== false) await lockTemplateOrder(tx, input.templateId);
  if (!options.templateChecked) await requireOwnedTemplate(tx, input.templateId, input.plantId);

  const masters = options.masters ?? await tx.pmTask.findMany({
    where: { id: { in: pmTaskIds }, plantId: input.plantId, isActive: true },
  });
  if (masters.length !== pmTaskIds.length) {
    throw new Error('One or more Task Masters are unavailable, inactive, or not in the same plant');
  }
  const masterById = new Map(masters.map((task) => [task.id, task]));
  const associations = await loadTemplateAssociations(tx, input.templateId);
  const associationByMasterId = new Map(
    associations.filter((row) => row.pmTaskId).map((row) => [row.pmTaskId as string, row]),
  );
  let nextCompatibilityNumber = Math.max(0, ...associations.map((row) => row.taskNumber)) + 1;
  let nextSortOrder = Math.max(-1, ...associations.map((row) => row.sortOrder)) + 1;
  const result: PmTemplateTask[] = [];
  const linkedIds: string[] = [];
  const reactivatedIds: string[] = [];

  for (const pmTaskId of pmTaskIds) {
    const master = masterById.get(pmTaskId) as PmTask;
    const existing = associationByMasterId.get(pmTaskId);
    if (existing?.isActive) {
      result.push(existing);
      continue;
    }
    if (existing) {
      const reactivated = await tx.pmTemplateTask.update({
        where: { id: existing.id },
        data: { isActive: true, sortOrder: nextSortOrder++ },
      });
      reactivatedIds.push(reactivated.id);
      result.push(reactivated);
      continue;
    }

    const created = await tx.pmTemplateTask.create({
      data: {
        templateId: input.templateId,
        pmTaskId: master.id,
        taskNumber: nextCompatibilityNumber++,
        description: master.description,
        taskType: 'check',
        requiredParts: null,
        estimatedMinutes: null,
        sortOrder: nextSortOrder++,
        isActive: true,
      },
    });
    linkedIds.push(created.id);
    result.push(created);
  }

  await auditAssociationMutation(tx, input, 'update', {
    event: 'link_task_masters',
    requestedPmTaskIds: pmTaskIds,
    linkedAssociationIds: linkedIds,
    reactivatedAssociationIds: reactivatedIds,
  });
  return result;
}

export async function linkPmTasksToTemplate(input: LinkPmTasksToTemplateInput): Promise<PmTemplateTask[]> {
  const pmTaskIds = assertUniqueIds(input.pmTaskIds, 'Task Master IDs');
  return db.$transaction((tx) => linkPmTasksInTransaction(tx, { ...input, pmTaskIds }));
}

export async function createAndLinkPmTasks(input: CreateAndLinkPmTasksInput): Promise<PmTemplateTask[]> {
  return db.$transaction(async (tx) => {
    await lockTemplateOrder(tx, input.templateId);
    await requireOwnedTemplate(tx, input.templateId, input.plantId);
    const masters = await createPmTaskBatchInTransaction(tx, {
      plantId: input.plantId,
      userId: input.userId,
      source: input.rows.length > 1 ? 'bulk' : 'single',
      rows: input.rows,
    });
    const orderedMasters = [...masters].sort((left, right) => left.taskNumber - right.taskNumber);
    return linkPmTasksInTransaction(tx, {
      ...input,
      pmTaskIds: orderedMasters.map((task) => task.id),
    }, { lock: false, templateChecked: true, masters: orderedMasters });
  });
}

export async function reorderPmTemplateTasks(input: ReorderPmTemplateTasksInput): Promise<string[]> {
  const associationIds = assertUniqueIds(input.associationIds, 'Association IDs');
  return db.$transaction(async (tx) => {
    await lockTemplateOrder(tx, input.templateId);
    await requireOwnedTemplate(tx, input.templateId, input.plantId);
    const active = (await loadTemplateAssociations(tx, input.templateId)).filter((row) => row.isActive);
    const activeIds = new Set(active.map((row) => row.id));
    if (active.length !== associationIds.length || !associationIds.every((id) => activeIds.has(id))) {
      throw new Error('Reorder must include the exact set of every active template association');
    }
    for (const [sortOrder, associationId] of associationIds.entries()) {
      await tx.pmTemplateTask.updateMany({
        where: { id: associationId, templateId: input.templateId, isActive: true },
        data: { sortOrder },
      });
    }
    await auditAssociationMutation(tx, input, 'update', {
      event: 'reorder_template_tasks',
      oldOrder: active.map((row) => row.id),
      newOrder: associationIds,
    });
    return associationIds;
  });
}

export async function deactivatePmTemplateTask(input: DeactivatePmTemplateTaskInput): Promise<PmTemplateTask> {
  return db.$transaction(async (tx) => {
    await lockTemplateOrder(tx, input.templateId);
    await requireOwnedTemplate(tx, input.templateId, input.plantId);
    const association = (await loadTemplateAssociations(tx, input.templateId)).find((row) => row.id === input.associationId);
    if (!association) throw new Error('PM template task association not found');
    if (!association.isActive) return association;
    const updated = await tx.pmTemplateTask.update({
      where: { id: association.id },
      data: { isActive: false },
    });
    await auditAssociationMutation(tx, input, 'delete', {
      event: 'remove_from_template',
      associationId: association.id,
      pmTaskId: association.pmTaskId,
      isActive: false,
    });
    return updated;
  });
}

export async function convertLegacyPmTemplateTask(input: ConvertLegacyPmTemplateTaskInput): Promise<PmTemplateTask> {
  return db.$transaction(async (tx) => {
    await lockTemplateOrder(tx, input.templateId);
    await requireOwnedTemplate(tx, input.templateId, input.plantId);
    const association = (await loadTemplateAssociations(tx, input.templateId)).find((row) => row.id === input.associationId);
    if (!association) throw new Error('PM template task association not found');
    if (association.pmTaskId) throw new Error('PM template task is already linked to the Task Library');
    const normalized = normalizePmTaskDraft({ description: association.description, taskType: input.taskType });
    const masters = await createPmTaskBatchInTransaction(tx, {
      plantId: input.plantId,
      userId: input.userId,
      source: 'single',
      rows: [normalized],
    });
    const master = masters[0];
    if (!master) throw new Error('Failed to create Task Master for legacy template task');
    const updated = await tx.pmTemplateTask.update({
      where: { id: association.id },
      data: { pmTaskId: master.id },
    });
    await auditAssociationMutation(tx, input, 'update', {
      event: 'convert_legacy_template_task',
      associationId: association.id,
      pmTaskId: master.id,
      taskType: master.taskType,
    });
    return updated;
  });
}
