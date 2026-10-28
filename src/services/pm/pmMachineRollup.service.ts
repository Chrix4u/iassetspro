import type { PmScheduleTask, Prisma } from '@prisma/client';
import { evaluateScheduledTaskDue, type ScheduledTaskDueResult } from '@/services/pm/pmScheduledTaskDueEngine';
import { findBlockingPmScheduledTaskCycles } from '@/services/pm/pmScheduledTaskCycleGuard.service';

type RollupClient = Pick<
  Prisma.TransactionClient,
  'asset' | 'componentRegistry' | 'pmScheduleTask' | 'assetMeter' | 'meterReading' | 'componentConditionReading' | 'iotDevice' | 'workOrderTaskExecution'
>;

export type PmRollupDueStatus = 'due' | 'near_due' | 'not_due';
export type PmRollupInspectionType = 'running' | 'standstill';

export interface PmTechnicalPathNode {
  id: string;
  name: string;
  componentCode: string;
  componentType: string;
}

export interface PmMachineRollupItem {
  id: string;
  assetId: string;
  componentId: string | null;
  targetKind: 'machine' | 'component';
  technicalPath: PmTechnicalPathNode[];
  technicalPathLabel: string;
  pmTask: { id: string; taskNumber: number; description: string; taskType: string };
  pmType: string;
  activityMode: string;
  inspectionType: PmRollupInspectionType;
  estimatedMinutes: number;
  leadDays: number;
  frequencyInterval: number | null;
  frequencyUnit: string | null;
  assetMeter: { id: string; name: string; unit: string; currentValue: number | string; lastReadingAt: Date | null; isActive: boolean } | null;
  nextDueDate: Date | null;
  nextDueReading: number | null;
  dueStatus: PmRollupDueStatus;
  dueReason: string;
  dueCycleKey: string | null;
  currentValue: number | null;
  planningAt: Date | null;
  isBundleEligible: boolean;
  blockingWorkOrderId: string | null;
}

export interface PmMachineRollupResult {
  machine: { id: string; name: string; assetTag: string; plantId: string };
  generatedAt: Date;
  planningWindowDays: number;
  planningWindow: { start: Date; end: Date };
  summary: { total: number; due: number; nearDue: number; later: number; running: number; standstill: number };
  assignments: PmMachineRollupItem[];
}

function normalizePlanningWindowDays(value: number | undefined): number {
  const numeric = Number(value ?? 7);
  if (!Number.isFinite(numeric)) return 7;
  return Math.min(90, Math.max(0, Math.trunc(numeric)));
}

export function normalizePmInspectionType(value: unknown): PmRollupInspectionType {
  return String(value || '').trim().toLowerCase() === 'running' ? 'running' : 'standstill';
}

function buildTechnicalPath(
  componentId: string | null,
  components: Map<string, PmTechnicalPathNode & { parentId: string | null; assetId: string | null }>,
): PmTechnicalPathNode[] {
  if (!componentId) return [];
  const path: PmTechnicalPathNode[] = [];
  const visited = new Set<string>();
  let current = components.get(componentId) || null;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push({ id: current.id, name: current.name, componentCode: current.componentCode, componentType: current.componentType });
    current = current.parentId ? components.get(current.parentId) || null : null;
  }
  return path.reverse();
}

function planningAt(task: PmScheduleTask, due: ScheduledTaskDueResult, now: Date): Date | null {
  if (task.maintenanceMode === 'tbm') return task.nextDueDate ? new Date(task.nextDueDate) : null;
  return due.due ? now : null;
}

function dueStatus(task: PmScheduleTask, due: ScheduledTaskDueResult, windowEnd: Date): PmRollupDueStatus {
  if (due.due) return 'due';
  if (task.maintenanceMode === 'tbm' && task.nextDueDate && task.nextDueDate.getTime() <= windowEnd.getTime()) return 'near_due';
  return 'not_due';
}

function statusRank(status: PmRollupDueStatus): number {
  if (status === 'due') return 0;
  if (status === 'near_due') return 1;
  return 2;
}

export async function getPmMachineRollup(input: {
  client: RollupClient;
  assetId: string;
  now?: Date;
  planningWindowDays?: number;
}): Promise<PmMachineRollupResult> {
  const assetId = String(input.assetId || '').trim();
  if (!assetId) throw new Error('Asset is required');
  const now = input.now ? new Date(input.now) : new Date();
  const windowDays = normalizePlanningWindowDays(input.planningWindowDays);
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const machine = await input.client.asset.findUnique({
    where: { id: assetId },
    select: { id: true, name: true, assetTag: true, plantId: true },
  });
  if (!machine) throw new Error('Asset not found');

  const [componentRows, assignmentRows] = await Promise.all([
    input.client.componentRegistry.findMany({
      where: { assetId },
      select: { id: true, assetId: true, parentId: true, name: true, componentCode: true, componentType: true },
      orderBy: [{ sortOrder: 'asc' }, { componentCode: 'asc' }],
    }),
    input.client.pmScheduleTask.findMany({
      where: { assetId, scheduleId: null, isActive: true },
      include: {
        pmTask: { select: { id: true, taskNumber: true, description: true, taskType: true } },
        component: { select: { id: true, assetId: true, parentId: true, name: true, componentCode: true, componentType: true } },
        assetMeter: { select: { id: true, name: true, unit: true, currentValue: true, lastReadingAt: true, isActive: true } },
      },
      orderBy: [{ nextDueDate: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const componentMap = new Map<string, PmTechnicalPathNode & { parentId: string | null; assetId: string | null }>();
  for (const component of componentRows as any[]) {
    if (component.assetId !== assetId) continue;
    componentMap.set(component.id, component);
  }

  const assignments: PmMachineRollupItem[] = [];
  for (const row of assignmentRows as any[]) {
    if (row.assetId !== assetId || row.scheduleId !== null) continue;
    if (row.componentId && !componentMap.has(row.componentId)) continue;
    const due = await evaluateScheduledTaskDue({
      client: input.client,
      task: row as PmScheduleTask,
      assetId,
      plantId: machine.plantId,
      componentId: row.componentId,
      now,
    });
    const technicalPath = buildTechnicalPath(row.componentId, componentMap);
    const status = dueStatus(row as PmScheduleTask, due, windowEnd);
    assignments.push({
      id: row.id,
      assetId,
      componentId: row.componentId,
      targetKind: row.componentId ? 'component' : 'machine',
      technicalPath,
      technicalPathLabel: technicalPath.map((node) => node.componentCode || node.name).join(' › '),
      pmTask: row.pmTask,
      pmType: row.pmType || row.maintenanceMode,
      activityMode: row.activityMode || 'inspection',
      inspectionType: normalizePmInspectionType(row.equipmentState),
      estimatedMinutes: Math.max(0, Number(row.estimatedMinutes) || 0),
      leadDays: Math.max(0, Number(row.leadDays) || 0),
      frequencyInterval: row.frequencyInterval == null ? null : Number(row.frequencyInterval),
      frequencyUnit: row.frequencyUnit || null,
      assetMeter: row.assetMeter || null,
      nextDueDate: row.nextDueDate ? new Date(row.nextDueDate) : null,
      nextDueReading: row.nextDueReading == null ? null : Number(row.nextDueReading),
      dueStatus: status,
      dueReason: due.reason,
      dueCycleKey: due.dueCycleKey,
      currentValue: due.currentValue,
      planningAt: planningAt(row as PmScheduleTask, due, now),
      isBundleEligible: due.due && Boolean(due.dueCycleKey),
      blockingWorkOrderId: null,
    });
  }

  const dueIdentities = assignments
    .filter((item) => item.dueStatus === 'due' && item.dueCycleKey)
    .map((item) => ({ pmScheduleTaskId: item.id, pmDueCycleKey: item.dueCycleKey! }));
  const blockers = await findBlockingPmScheduledTaskCycles(input.client, dueIdentities);
  const blockerMap = new Map(blockers.map((row) => [`${row.pmScheduleTaskId}:${row.pmDueCycleKey}`, row.workOrderId]));
  for (const item of assignments) {
    if (!item.dueCycleKey) continue;
    const blockingWorkOrderId = blockerMap.get(`${item.id}:${item.dueCycleKey}`) || null;
    if (blockingWorkOrderId) {
      item.isBundleEligible = false;
      item.blockingWorkOrderId = blockingWorkOrderId;
    }
  }

  assignments.sort((left, right) => {
    const rank = statusRank(left.dueStatus) - statusRank(right.dueStatus);
    if (rank !== 0) return rank;
    const leftAt = left.planningAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightAt = right.planningAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return left.pmTask.taskNumber - right.pmTask.taskNumber || left.id.localeCompare(right.id);
  });

  return {
    machine,
    generatedAt: now,
    planningWindowDays: windowDays,
    planningWindow: { start: now, end: windowEnd },
    summary: {
      total: assignments.length,
      due: assignments.filter((item) => item.dueStatus === 'due').length,
      nearDue: assignments.filter((item) => item.dueStatus === 'near_due').length,
      later: assignments.filter((item) => item.dueStatus === 'not_due').length,
      running: assignments.filter((item) => item.inspectionType === 'running').length,
      standstill: assignments.filter((item) => item.inspectionType === 'standstill').length,
    },
    assignments,
  };
}
