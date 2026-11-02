import type { PmScheduleTask, Prisma } from '@prisma/client';
import { getAssetLiveLocationMap } from '@/lib/functional-location/live-location';
import { buildMaintenanceLocationSnapshot } from '@/lib/functional-location/maintenance-snapshot';
import { calculatePmPlannedEnd } from '@/services/pm/plannedWindow.service';
import type { ScheduledTaskDueResult } from '@/services/pm/pmScheduledTaskDueEngine';
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

export function normalizePmPlannedStart(now: Date, plannedExecutionAt: Date | undefined, planningWindowDays = 7): Date {
  const horizonEnd = new Date(now.getTime() + normalizedWindowDays(planningWindowDays) * 24 * 60 * 60 * 1000);
  const requested = plannedExecutionAt ? new Date(plannedExecutionAt) : new Date(now);
  if (!Number.isFinite(requested.getTime())) throw new Error('Planned execution date is invalid');
  if (requested.getTime() < now.getTime()) {
    if (now.getTime() - requested.getTime() <= 60_000) return new Date(now);
    throw new Error('Planned execution date cannot be in the past');
  }
  if (requested.getTime() > horizonEnd.getTime()) throw new Error('Planned execution date is outside the selected planning window');
  return requested;
}

export function buildPmBundleGroups(items: BundleCompatibleItem[], planningWindowDays = 7): PmBundleGroup[] {
  const spanMs = normalizedWindowDays(planningWindowDays) * 24 * 60 * 60 * 1000;
  const eligible = [...items]
    .filter((item) => (item.dueStatus === 'due' || item.dueStatus === 'near_due') && item.isBundleEligible !== false)
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
  if (items.some((item) => item.dueStatus !== 'due' && item.dueStatus !== 'near_due')) throw new Error('Only due or planned-early PM assignments can be materialized into a work bundle');
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
  const disposition = candidate.planningDisposition === 'planned_early' && !candidate.due.due ? 'PLANNED EARLY' : 'DUE';
  const originalDue = candidate.task.nextDueDate ? ` | original due ${candidate.task.nextDueDate.toISOString()}` : '';
  return `[${disposition}] Task #${candidate.task.pmTask.taskNumber}: ${candidate.task.pmTask.description} | ${target}${originalDue}`;
}

type PmBundleRootClient = {
  pmScheduleTask: {
    findMany: (args: any) => Promise<Array<{ assetId: string }>>;
  };
  $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

export interface DirectPmAutoGenerationResultItem {
  assetId: string;
  inspectionType: PmRollupInspectionType;
  assignmentIds: string[];
  workOrderId: string;
  woNumber: string;
  skipped: boolean;
  reason?: string;
}

export interface DirectPmAutoGenerationResult {
  checked: number;
  generated: number;
  skipped: number;
  materializedAssignments: number;
  results: DirectPmAutoGenerationResultItem[];
}

async function lockDirectPmAssignments(tx: Prisma.TransactionClient, assignmentIds: string[]): Promise<void> {
  for (const assignmentId of [...assignmentIds].sort()) {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `iassetspro:pm-assignment:${assignmentId}`,
    );
  }
}

function dueFromRollupItem(task: PmScheduleTask, item: PmMachineRollupItem): ScheduledTaskDueResult {
  return {
    due: item.dueStatus === 'due',
    reason: item.dueReason,
    maintenanceMode: task.maintenanceMode as ScheduledTaskDueResult['maintenanceMode'],
    dueCycleKey: item.dueCycleKey,
    currentValue: item.currentValue,
    source: item.dueSource,
  };
}

async function materializePmAssignmentBundleInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    assetId: string;
    assignmentIds: string[];
    now: Date;
    planningWindowDays: number;
    plannedStart: Date;
    rollup: Awaited<ReturnType<typeof getPmMachineRollup>>;
    locationSnapshot: ReturnType<typeof buildMaintenanceLocationSnapshot>;
    allowPlannedEarly: boolean;
    autoGenerated: boolean;
  },
) {
  const itemMap = new Map(input.rollup.assignments.map((item) => [item.id, item]));
  const selectedItems = input.assignmentIds
    .map((id) => itemMap.get(id))
    .filter((item): item is PmMachineRollupItem => Boolean(item));
  if (selectedItems.length !== input.assignmentIds.length) {
    throw new Error('One or more direct PM assignments are unavailable for this machine');
  }
  assertCompatiblePmBundle(selectedItems, input.planningWindowDays);
  if (!input.allowPlannedEarly && selectedItems.some((item) => item.dueStatus !== 'due')) {
    throw new Error('Automatic PM generation only materializes assignments that are currently due');
  }
  if (selectedItems.some((item) => !item.isBundleEligible || !item.dueCycleKey)) {
    throw new Error('One or more PM assignments are not eligible for bundling');
  }

  const rows = await tx.pmScheduleTask.findMany({
    where: { id: { in: input.assignmentIds }, assetId: input.assetId, scheduleId: null, isActive: true },
    include: { pmTask: { select: { id: true, taskNumber: true, description: true, taskType: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  if (rows.length !== input.assignmentIds.length) throw new Error('One or more direct PM assignments no longer exist');

  const planningHorizonEnd = new Date(input.now.getTime() + input.planningWindowDays * 24 * 60 * 60 * 1000);
  const candidates: MaterializablePmScheduledTask[] = [];
  for (const row of rows as any[]) {
    const rollupItem = itemMap.get(row.id)!;
    const due = dueFromRollupItem(row as PmScheduleTask, rollupItem);
    if (!due.dueCycleKey) throw new Error(`PM assignment ${row.id} has no stable due-cycle identity`);

    if (due.due) {
      candidates.push({ task: row, due, planningDisposition: 'due', plannedExecutionAt: input.plannedStart });
      continue;
    }

    const canPlanEarly = input.allowPlannedEarly
      && rollupItem.dueStatus === 'near_due'
      && row.maintenanceMode === 'tbm'
      && row.nextDueDate
      && row.nextDueDate.getTime() <= planningHorizonEnd.getTime();
    if (!canPlanEarly) throw new Error(`PM assignment ${row.id} is no longer due or eligible for planned-early execution`);

    candidates.push({ task: row, due, planningDisposition: 'planned_early', plannedExecutionAt: input.plannedStart });
  }

  const blockers = await findBlockingPmScheduledTaskCycles(tx, candidates.map((entry) => ({
    pmScheduleTaskId: entry.task.id,
    pmDueCycleKey: entry.due.dueCycleKey!,
  })));
  if (blockers.length) throw new Error(`One or more PM cycles are already materialized in work order ${blockers[0].workOrderId}`);

  const asset = await tx.asset.findUnique({
    where: { id: input.assetId },
    select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true },
  });
  if (!asset) throw new Error('Asset not found');

  const totalMinutes = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry.task.estimatedMinutes) || 0), 0);
  const estimatedHours = roundHours(totalMinutes);
  const plannedEnd = calculatePmPlannedEnd(input.plannedStart, estimatedHours);
  const inspectionType = selectedItems[0].inspectionType;
  const woNumber = await allocatePmWorkOrderNumber(tx, input.now);
  const lines = candidates.map((candidate) => taskLine(candidate, itemMap.get(candidate.task.id)!));

  const workOrder = await tx.workOrder.create({
    data: {
      woNumber,
      title: `PM Bundle: ${asset.name} · ${inspectionType === 'standstill' ? 'STANDSTILL' : 'RUNNING'}`,
      description: `Direct PM work bundle for ${asset.name || asset.assetTag}.\n\nPM Assignments:\n${lines.join('\n')}`,
      type: 'preventive',
      priority: 'medium',
      status: inspectionType === 'standstill' ? 'waiting_shutdown' : 'draft',
      assetId: input.assetId,
      assetName: asset.name,
      ...input.locationSnapshot,
      plannerId: input.actorId,
      departmentId: asset.departmentId || null,
      plantId: asset.plantId,
      estimatedHours,
      plannedStart: input.plannedStart,
      plannedEnd,
      notes: `${input.autoGenerated ? 'Auto-bundled' : 'Bundled'} from ${input.assignmentIds.length} direct PM assignment(s) · inspection type ${inspectionType}`,
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
      data: { lastGeneratedAt: input.now, lastGeneratedCycleKey: candidate.due.dueCycleKey },
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
        autoGenerated: input.autoGenerated,
        assetId: input.assetId,
        inspectionType,
        pmAssignmentIds: input.assignmentIds,
        componentIds,
        plannedExecutionAt: input.plannedStart.toISOString(),
        dueCycles: candidates.map((candidate) => candidate.due.dueCycleKey),
        planningDispositionByAssignment: candidates.map((candidate) => ({
          pmAssignmentId: candidate.task.id,
          disposition: candidate.planningDisposition === 'planned_early' && !candidate.due.due ? 'planned_early' : 'due',
          originalDueDate: candidate.task.nextDueDate?.toISOString() ?? null,
          dueCycleKey: candidate.due.dueCycleKey,
        })),
      }),
    },
  });

  return { workOrder, inspectionType, assignmentIds: input.assignmentIds, componentIds, materializedAssignments: candidates.length };
}

export async function createPmAssignmentBundle(client: { $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> }, input: {
  actorId: string;
  assetId: string;
  assignmentIds: string[];
  now?: Date;
  planningWindowDays?: number;
  plannedExecutionAt?: Date;
}) {
  const assetId = String(input.assetId || '').trim();
  const assignmentIds = [...new Set((input.assignmentIds || []).map((id) => String(id || '').trim()).filter(Boolean))].sort();
  if (!assetId) throw new Error('Asset is required');
  if (assignmentIds.length === 0) throw new Error('At least one PM assignment is required');
  const now = input.now ? new Date(input.now) : new Date();
  const planningWindowDays = normalizedWindowDays(input.planningWindowDays);
  const plannedStart = normalizePmPlannedStart(now, input.plannedExecutionAt, planningWindowDays);
  const locationMap = await getAssetLiveLocationMap([assetId]);
  const locationSnapshot = buildMaintenanceLocationSnapshot(locationMap.get(assetId) ?? null);

  return client.$transaction(async (tx) => {
    await lockDirectPmAssignments(tx, assignmentIds);
    const rollup = await getPmMachineRollup({ client: tx, assetId, now, planningWindowDays });
    return materializePmAssignmentBundleInTransaction(tx, {
      actorId: input.actorId,
      assetId,
      assignmentIds,
      now,
      planningWindowDays,
      plannedStart,
      rollup,
      locationSnapshot,
      allowPlannedEarly: true,
      autoGenerated: false,
    });
  });
}

export async function generateDueDirectPmAssignmentWorkOrders(
  client: PmBundleRootClient,
  input: { actorId: string; plantIds?: string[]; now?: Date },
): Promise<DirectPmAutoGenerationResult> {
  const now = input.now ? new Date(input.now) : new Date();
  const where: Record<string, unknown> = { scheduleId: null, isActive: true };
  if (input.plantIds?.length) where.asset = { plantId: { in: input.plantIds } };

  const assetRows = await client.pmScheduleTask.findMany({
    where,
    select: { assetId: true },
    distinct: ['assetId'],
    orderBy: { assetId: 'asc' },
  });
  const assetIds = [...new Set(assetRows.map((row) => row.assetId).filter(Boolean))].sort();
  if (assetIds.length === 0) {
    return { checked: 0, generated: 0, skipped: 0, materializedAssignments: 0, results: [] };
  }

  const locationMap = await getAssetLiveLocationMap(assetIds);
  let checked = 0;
  let materializedAssignments = 0;
  const results: DirectPmAutoGenerationResultItem[] = [];

  for (const assetId of assetIds) {
    const assetResult = await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `iassetspro:pm-assignment-auto:${assetId}`,
      );
      const rollup = await getPmMachineRollup({ client: tx, assetId, now, planningWindowDays: 0 });
      const dueItems = rollup.assignments.filter((item) => item.dueStatus === 'due' && item.isBundleEligible && item.dueCycleKey);
      // Reuse the same compatibility window as planner bundling. This keeps an older
      // overdue cycle from blocking newer due work on the same machine/state: cycles
      // too far apart are materialized as separate work orders instead of one invalid bundle.
      const groups = buildPmBundleGroups(dueItems, 7);

      const generated: DirectPmAutoGenerationResultItem[] = [];
      let materialized = 0;
      for (const group of groups) {
        const inspectionType = group.inspectionType;
        const assignmentIds = [...group.assignmentIds].sort();
        await lockDirectPmAssignments(tx, assignmentIds);
        try {
          const bundle = await materializePmAssignmentBundleInTransaction(tx, {
            actorId: input.actorId,
            assetId,
            assignmentIds,
            now,
            planningWindowDays: 7,
            plannedStart: now,
            rollup,
            locationSnapshot: buildMaintenanceLocationSnapshot(locationMap.get(assetId) ?? null),
            allowPlannedEarly: false,
            autoGenerated: true,
          });
          materialized += bundle.materializedAssignments;
          generated.push({
            assetId,
            inspectionType,
            assignmentIds,
            workOrderId: bundle.workOrder.id,
            woNumber: bundle.workOrder.woNumber,
            skipped: false,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Direct PM automatic bundle failed';
          if (/already materialized|not eligible for bundling/i.test(message)) {
            generated.push({
              assetId,
              inspectionType,
              assignmentIds,
              workOrderId: '',
              woNumber: '',
              skipped: true,
              reason: message,
            });
            continue;
          }
          throw error;
        }
      }
      return { checked: rollup.assignments.length, materialized, generated };
    });

    checked += assetResult.checked;
    materializedAssignments += assetResult.materialized;
    results.push(...assetResult.generated);
  }

  return {
    checked,
    generated: results.filter((result) => !result.skipped).length,
    skipped: Math.max(0, checked - materializedAssignments),
    materializedAssignments,
    results,
  };
}
