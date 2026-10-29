import type { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;

export type PmComplianceOutcome = 'completed' | 'overdue_open' | 'missed';

export interface PmComplianceExecutionRow {
  id: string;
  workOrderId: string;
  pmScheduleTaskId: string | null;
  pmDueCycleKey: string | null;
  pmPlanningSnapshot: string | null;
  taskNumber: number;
  description: string;
  status: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  workOrder: {
    id: string;
    woNumber: string;
    status: string;
  };
  pmScheduleTask: {
    pmType: string;
    maintenanceMode: string;
  } | null;
}

export interface PmComplianceCycle {
  identity: string;
  pmScheduleTaskId: string;
  pmDueCycleKey: string | null;
  taskNumber: number;
  description: string;
  pmType: string;
  maintenanceMode: string;
  dueAt: string;
  outcome: PmComplianceOutcome;
  completedAt: string | null;
  delayMinutes: number | null;
  workOrderId: string;
  workOrderNumber: string;
  workOrderStatus: string;
}

export interface PmComplianceResult {
  window: {
    days: number;
    start: string;
    end: string;
  };
  summary: {
    maturedCycles: number;
    completed: number;
    openOverdue: number;
    missed: number;
    completionCompliancePct: number | null;
  };
  cycles: PmComplianceCycle[];
}

type PmComplianceClient = Pick<Prisma.TransactionClient, 'workOrderTaskExecution'>;

type PlanningSnapshot = {
  maintenanceMode?: unknown;
  nextDueDate?: unknown;
};

function parsePlanningSnapshot(value: string | null): PlanningSnapshot | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as PlanningSnapshot : null;
  } catch {
    return null;
  }
}

function validDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizePmComplianceWindowDays(value?: number): number {
  const numeric = Number(value ?? DEFAULT_WINDOW_DAYS);
  if (!Number.isFinite(numeric)) return DEFAULT_WINDOW_DAYS;
  return Math.min(MAX_WINDOW_DAYS, Math.max(1, Math.trunc(numeric)));
}

function executionMode(row: PmComplianceExecutionRow, snapshot: PlanningSnapshot | null): string {
  const snapMode = typeof snapshot?.maintenanceMode === 'string' ? snapshot.maintenanceMode.trim().toLowerCase() : '';
  if (snapMode) return snapMode;
  const storedMode = String(row.pmScheduleTask?.maintenanceMode || '').trim().toLowerCase();
  if (storedMode) return storedMode;
  return String(row.pmScheduleTask?.pmType || '').trim().toLowerCase();
}

function dueInstant(row: PmComplianceExecutionRow): Date {
  const snapshot = parsePlanningSnapshot(row.pmPlanningSnapshot);
  if (executionMode(row, snapshot) === 'tbm') {
    const nextDue = validDate(snapshot?.nextDueDate);
    if (nextDue) return nextDue;
  }
  return row.createdAt;
}

function cycleIdentity(row: PmComplianceExecutionRow): string | null {
  if (!row.pmScheduleTaskId) return null;
  return `${row.pmScheduleTaskId}:${row.pmDueCycleKey || `legacy:${row.id}`}`;
}

function terminalMissedAttempt(row: PmComplianceExecutionRow): boolean {
  if (row.status === 'failed' || row.status === 'skipped') return true;
  return ['cancelled', 'closed', 'completed', 'verified'].includes(row.workOrder.status);
}

function completedAttempt(rows: PmComplianceExecutionRow[]): PmComplianceExecutionRow | null {
  const completed = rows
    .filter((row) => row.status === 'completed')
    .sort((left, right) => {
      const leftAt = (left.completedAt || left.updatedAt).getTime();
      const rightAt = (right.completedAt || right.updatedAt).getTime();
      return leftAt - rightAt || left.id.localeCompare(right.id);
    });
  return completed[0] || null;
}

function activeAttempt(rows: PmComplianceExecutionRow[]): PmComplianceExecutionRow | null {
  const active = rows
    .filter((row) => row.status !== 'completed' && !terminalMissedAttempt(row))
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || right.id.localeCompare(left.id));
  return active[0] || null;
}

function latestAttempt(rows: PmComplianceExecutionRow[]): PmComplianceExecutionRow {
  return [...rows].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || right.id.localeCompare(left.id))[0];
}

function delayMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / MINUTE_MS));
}

export function summarizePmComplianceExecutions(
  rows: PmComplianceExecutionRow[],
  now: Date,
  windowDays?: number,
): PmComplianceResult {
  const days = normalizePmComplianceWindowDays(windowDays);
  const end = new Date(now);
  const start = new Date(end.getTime() - days * DAY_MS);
  const grouped = new Map<string, PmComplianceExecutionRow[]>();

  for (const row of rows) {
    const identity = cycleIdentity(row);
    if (!identity) continue;
    const current = grouped.get(identity);
    if (current) current.push(row);
    else grouped.set(identity, [row]);
  }

  const cycles: PmComplianceCycle[] = [];
  for (const [identity, attempts] of grouped) {
    const dueCandidates = attempts.map(dueInstant).filter((date) => Number.isFinite(date.getTime()));
    if (dueCandidates.length === 0) continue;
    const dueAt = new Date(Math.min(...dueCandidates.map((date) => date.getTime())));
    if (dueAt.getTime() < start.getTime() || dueAt.getTime() > end.getTime()) continue;

    const completed = completedAttempt(attempts);
    const active = completed ? null : activeAttempt(attempts);
    const representative = completed || active || latestAttempt(attempts);
    const outcome: PmComplianceOutcome = completed ? 'completed' : active ? 'overdue_open' : 'missed';
    const completionAt = completed ? completed.completedAt || completed.updatedAt : null;
    const modeSnapshot = parsePlanningSnapshot(representative.pmPlanningSnapshot);
    const maintenanceMode = executionMode(representative, modeSnapshot) || 'unknown';

    cycles.push({
      identity,
      pmScheduleTaskId: representative.pmScheduleTaskId!,
      pmDueCycleKey: representative.pmDueCycleKey,
      taskNumber: representative.taskNumber,
      description: representative.description,
      pmType: String(representative.pmScheduleTask?.pmType || maintenanceMode || 'unknown'),
      maintenanceMode,
      dueAt: dueAt.toISOString(),
      outcome,
      completedAt: completionAt?.toISOString() || null,
      delayMinutes: completed && completionAt
        ? delayMinutes(dueAt, completionAt)
        : active
          ? delayMinutes(dueAt, end)
          : null,
      workOrderId: representative.workOrderId,
      workOrderNumber: representative.workOrder.woNumber,
      workOrderStatus: representative.workOrder.status,
    });
  }

  cycles.sort((left, right) => new Date(right.dueAt).getTime() - new Date(left.dueAt).getTime() || right.identity.localeCompare(left.identity));

  const completed = cycles.filter((cycle) => cycle.outcome === 'completed').length;
  const openOverdue = cycles.filter((cycle) => cycle.outcome === 'overdue_open').length;
  const missed = cycles.filter((cycle) => cycle.outcome === 'missed').length;
  const maturedCycles = cycles.length;
  const completionCompliancePct = maturedCycles === 0 ? null : Math.round((completed / maturedCycles) * 1000) / 10;

  return {
    window: { days, start: start.toISOString(), end: end.toISOString() },
    summary: { maturedCycles, completed, openOverdue, missed, completionCompliancePct },
    cycles,
  };
}

export async function getPmCompliance(input: {
  client: PmComplianceClient;
  assetId: string;
  now?: Date;
  windowDays?: number;
}): Promise<PmComplianceResult> {
  const assetId = String(input.assetId || '').trim();
  if (!assetId) throw new Error('Asset is required');
  const now = input.now ? new Date(input.now) : new Date();
  const windowDays = normalizePmComplianceWindowDays(input.windowDays);

  const rows = await input.client.workOrderTaskExecution.findMany({
    where: {
      pmScheduleTask: {
        is: { assetId, scheduleId: null },
      },
    },
    select: {
      id: true,
      workOrderId: true,
      pmScheduleTaskId: true,
      pmDueCycleKey: true,
      pmPlanningSnapshot: true,
      taskNumber: true,
      description: true,
      status: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      workOrder: { select: { id: true, woNumber: true, status: true } },
      pmScheduleTask: { select: { pmType: true, maintenanceMode: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return summarizePmComplianceExecutions(rows as PmComplianceExecutionRow[], now, windowDays);
}
