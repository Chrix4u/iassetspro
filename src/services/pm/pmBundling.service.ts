import type { PmScheduleTask, Prisma } from '@prisma/client';
import { getAssetLiveLocationMap } from '@/lib/functional-location/live-location';
import { buildMaintenanceLocationSnapshot } from '@/lib/functional-location/maintenance-snapshot';
import { calculatePmPlannedEnd } from '@/services/pm/plannedWindow.service';
import { evaluateScheduledTaskDue } from '@/services/pm/pmScheduledTaskDueEngine';
import { materializePmScheduledTasks, type MaterializablePmScheduledTask } from '@/services/pm/materializePmScheduledTasks.service';
import { findBlockingPmScheduledTaskCycles } from '@/services/pm/pmScheduledTaskCycleGuard.service';
import { getPmMachineRollup, type PmMachineRollupItem, type PmRollupInspectionType } from '@/services/pm/pmMachineRollup.service';

export interface PmBundleGroup {
  key: string;
  assetId: string;
  inspectionType: PmRollupInspectionType;
  assignmentIds: string[];
  planningStart: string | null;
  planningEnd: string | null;
  totalEstimatedMinutes: number;
}

type BundleCompatibleItem = Pick<
  PmMachineRollupItem,
  'id' | 'assetId' | 'inspectionType' | 'dueStatus' | 'planningAt' | 'estimatedMinutes'
> & { isBundleEligible?: boolean };

function normalizedWindowDays(value: number | undefined): number {
  const numeric = Number(value ?? 7);
  if (!Number.isFinite(numeric)) return 7;
  return Math.min(90, Math.max(0, Math.trunc(numeric)));
}

function itemPlanningMs(item: BundleCompatibleItem): number {
  if (!item.planningAt) return 0;
  const date = item.planningAt instanceof Date ? item.planningAt : new Date(item.planningAt as unknown as string);
  const value = date.getTime();
  return Number.isFinite(value) ? value : 0;
}

export function buildPmBundleGroups(items: BundleCompatibleItem[], planningWindowDays = 7): PmBundleGroup[] {
  const spanMs = normalizedWindowDays(planningWindowDays) * 24 * 60 * 60 * 1000;
  const eligible = [...items]
    .filter((item) => item.dueStatus === 'due' && item.isBundleEligible !== false)
    .sort((left, right) => left.assetId.localeCompare(right.assetId)
      || left.inspectionType.localeCompare(right.inspectionType)
      || itemPlanningMs(left) - itemPlanningMs(right)
      || left.id.localeCompare(right.id));

  const groups: PmBundleGroup[] = [];
  for (const item of eligible) {
    const planningMs = itemPlanningMs(item);
    const current = groups[groups.length - 1];
    const currentStartMs = current?.planningStart ? new Date(current.planningStart).getTime() : 0;
    const compatible = Boolean(current)
      && current.assetId === item.assetId
      && current.inspectionType === item.inspectionType
      && (planningMs === 0 || currentStartMs === 0 || planningMs - currentStartMs <= spanMs);

    if (!compatible) {
      const iso = planningMs ? new Date(planningMs).toISOString() : null;
      groups.push({
        key: `${item.assetId}:${item.inspectionType}:${planningMs || 'unscheduled'}:${item.id}`,
        assetId: item.assetId,
        inspectionType: item.inspectionType,
        assignmentIds: [item.id],
        planningStart: iso,
        planningEnd: iso,
        totalEstimatedMinutes: Math.max(0, Number(item.estimatedMinutes) || 0),
      });
      continue;
    }

    current.assignmentIds.push(item.id);
    current.totalEstimatedMinutes += Math.max(0, Number(item.estimatedMinutes) || 0);
    if (planningMs) {
      const iso = new Date(planningMs).toISOString();
      if (!current.planningStart || planningMs < new Date(current.planningStart).getTime()) current.planningStart = iso;
      if (!current.planningEnd || planningMs > new Date(current.planningEnd).getTime()) current.planningEnd = iso;
    }
  }
  return groups;
}

export function assertCompatiblePmBundle(items: BundleCompatibleItem[], planningWindowDays = 7): void {
  if (items.length === 0) throw new Error('At least one PM assignment is required');
  const assetId = items[0].assetId;
  if (items.some((item) => item.assetId !== assetId)) throw new Error('PM bundle assignments must belong to the same machine');
  const inspectionType = items[0].inspectionType;
  if (items.some((item) => item.inspectionType !== inspectionType)) {
    throw new Error('Running and Standstill PM assignments cannot be mixed in the same bundle');
  }
  if (items.some((item) => item.dueStatus !== 'due')) throw new Error('Only due PM assignments can be materialized into a work bundle');
  const times = items.map(itemPlanningMs).filter((value) => value > 0).sort((a, b) => a - b);
  if (times.length > 1) {
    const allowed = normalizedWindowDays(planningWindowDays) * 24 * 60 * 60 * 1000;
    if (times[times.length - 1] - times[0] > allowed) throw new Error('Selected PM assignments are outside the compatible planning window');
  }
}

function roundHours(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

async function allocatePmWorkOrderNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `iassetspro:pm-wo-number:${prefix}`);
  const rows = await tx.workOrder.findMany({ where: { woNumber: { startsWith: prefix } }, select: { woNumber: true } });
  const highest = rows.reduce((max, row) => {
    const suffix = Number.parseInt(row.woNumber.slice(prefix.length + 1), 10);
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}

function taskLine(candidate: MaterializablePmScheduledTask, item: PmMachineRollupItem): string {
  const target = item.technicalPathLabel || 'Whole machine';
  return `Task #${candidate.task.pmTask.taskNumber}: ${candidate.task.pmTask.description} | ${target}`;
}

export async function createPmAssignmentBundle(client: { $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> }, input: {
  actorId: string;
  assetId: string;
  assignmentIds: string[];
  now?: Date;
  planningWindowDays?: number;
}) {
  const assetId = String(input.assetId || '').trim();
  const assignmentIds = [...new Set((input.assignmentIds || []).map((id) => String(id || '').trim()).filter(Boolean))].sort();
  if (!assetId) throw new Error('Asset is required');
  if (assignmentIds.length === 0) throw new Error('At least one PM assignment is required');
  const now = input.now ? new Date(input.now) : new Date();
  const planningWindowDays = normalizedWindowDays(input.planningWindowDays);
  const locationMap = await getAssetLiveLocationMap([assetId]);
  const locationSnapshot = buildMaintenanceLocationSnapshot(locationMap.get(assetId) ?? null);

  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `iassetspro:pm-assignment-bundle:${assignmentIds.join(',')}`,
    );

    const rollup = await getPmMachineRollup({ client: tx, assetId, now, planningWindowDays });
    const itemMap = new Map(rollup.assignments.map((item) => [item.id, item]));
    const selectedItems = assignmentIds.map((id) => itemMap.get(id)).filter((item): item is PmMachineRollupItem => Boolean(item));
    if (selectedItems.length !== assignmentIds.length) throw new Error('One or more direct PM assignments are unavailable for this machine');
    assertCompatiblePmBundle(selectedItems, planningWindowDays);
    if (selectedItems.some((item) => !item.isBundleEligible || !item.dueCycleKey)) throw new Error('One or more PM assignments are not eligible for bundling');

    const rows = await tx.pmScheduleTask.findMany({
      where: { id: { in: assignmentIds }, assetId, scheduleId: null, isActive: true },
      include: { pmTask: { select: { id: true, taskNumber: true, description: true, taskType: true } } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (rows.length !== assignmentIds.length) throw new Error('One or more direct PM assignments no longer exist');

    const candidates: MaterializablePmScheduledTask[] = [];
    for (const row of rows as any[]) {
      const due = await evaluateScheduledTaskDue({
        client: tx,
        task: row as PmScheduleTask,
        assetId,
        plantId: rollup.machine.plantId,
        componentId: row.componentId,
        now,
      });
      if (!due.due || !due.dueCycleKey) throw new Error(`PM assignment ${row.id} is no longer due`);
      candidates.push({ task: row, due });
    }

    const blockers = await findBlockingPmScheduledTaskCycles(tx, candidates.map((entry) => ({
      pmScheduleTaskId: entry.task.id,
      pmDueCycleKey: entry.due.dueCycleKey!,
    })));
    if (blockers.length) throw new Error(`One or more PM cycles are already materialized in work order ${blockers[0].workOrderId}`);

    const asset = await tx.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true },
    });
    if (!asset) throw new Error('Asset not found');

    const totalMinutes = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry.task.estimatedMinutes) || 0), 0);
    const estimatedHours = roundHours(totalMinutes);
    const planningDates = selectedItems.map((item) => item.planningAt?.getTime()).filter((value): value is number => Number.isFinite(value));
    const plannedStart = planningDates.length ? new Date(Math.min(...planningDates)) : now;
    const plannedEnd = calculatePmPlannedEnd(plannedStart, estimatedHours);
    const inspectionType = selectedItems[0].inspectionType;
    const woNumber = await allocatePmWorkOrderNumber(tx, now);
    const lines = candidates.map((candidate) => taskLine(candidate, itemMap.get(candidate.task.id)!));

    const workOrder = await tx.workOrder.create({
      data: {
        woNumber,
        title: `PM Bundle: ${asset.name} · ${inspectionType === 'standstill' ? 'STANDSTILL' : 'RUNNING'}`,
        description: `Direct PM work bundle for ${asset.name || asset.assetTag}.\n\nDue PM Assignments:\n${lines.join('\n')}`,
        type: 'preventive',
        priority: 'medium',
        status: inspectionType === 'standstill' ? 'waiting_shutdown' : 'draft',
        assetId,
        assetName: asset.name,
        ...locationSnapshot,
        plannerId: input.actorId,
        departmentId: asset.departmentId || null,
        plantId: asset.plantId,
        estimatedHours,
        plannedStart,
        plannedEnd,
        notes: `Bundled from ${assignmentIds.length} direct PM assignment(s) · inspection type ${inspectionType}`,
      },
    });

    const componentIds = [...new Set(selectedItems.map((item) => item.componentId).filter((id): id is string => Boolean(id)))];
    for (const componentId of componentIds) {
      await tx.workOrderComponent.upsert({
        where: { workOrderId_componentRegistryId: { workOrderId: workOrder.id, componentRegistryId: componentId } },
        create: { workOrderId: workOrder.id, componentRegistryId: componentId, notes: 'Exact target inherited from direct PM assignment bundle' },
        update: {},
      });
    }

    await materializePmScheduledTasks(tx, workOrder.id, candidates);
    for (const candidate of candidates) {
      const item = itemMap.get(candidate.task.id)!;
      await tx.workOrderComment.create({
        data: { workOrderId: workOrder.id, userId: input.actorId, content: `${taskLine(candidate, item)} · cycle ${candidate.due.dueCycleKey}` },
      });
      await tx.pmScheduleTask.update({
        where: { id: candidate.task.id },
        data: { lastGeneratedAt: now, lastGeneratedCycleKey: candidate.due.dueCycleKey },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: input.actorId,
        action: 'create',
        entityType: 'work_order',
        entityId: workOrder.id,
        newValues: JSON.stringify({
          woNumber,
          type: 'preventive',
          directPmBundle: true,
          assetId,
          inspectionType,
          pmAssignmentIds: assignmentIds,
          componentIds,
          dueCycles: candidates.map((candidate) => candidate.due.dueCycleKey),
        }),
      },
    });

    return { workOrder, inspectionType, assignmentIds, componentIds };
  });
}
