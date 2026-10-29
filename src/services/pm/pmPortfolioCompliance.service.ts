import type { Prisma } from '@prisma/client';
import {
  normalizePmComplianceWindowDays,
  summarizePmComplianceExecutions,
  type PmComplianceCycle,
  type PmComplianceExecutionRow,
} from '@/services/pm/pmCompliance.service';

export interface PmPortfolioComplianceExecutionRow extends Omit<PmComplianceExecutionRow, 'pmScheduleTask'> {
  pmScheduleTask: {
    pmType: string;
    maintenanceMode: string;
    asset: {
      id: string;
      name: string;
      assetTag: string;
      plantId: string;
      departmentId: string | null;
      department: { id: string; name: string } | null;
    };
  } | null;
}

export interface PmPortfolioComplianceSummary {
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
  machinesWithMaturedCycles: number;
  machinesWithOpenOverdue: number;
}

export interface PmPortfolioDepartmentRow {
  departmentId: string | null;
  departmentName: string;
  machineCount: number;
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
  oldestOpenOverdueMinutes: number | null;
}

export interface PmPortfolioMachineRow {
  assetId: string;
  assetName: string;
  assetTag: string;
  departmentId: string | null;
  departmentName: string;
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
  oldestOpenOverdueMinutes: number | null;
}

export interface PmPortfolioOverdueCycle extends PmComplianceCycle {
  assetId: string;
  assetName: string;
  assetTag: string;
  departmentId: string | null;
  departmentName: string;
}

export interface PmPortfolioComplianceResult {
  window: {
    days: number;
    start: string;
    end: string;
  };
  summary: PmPortfolioComplianceSummary;
  departments: PmPortfolioDepartmentRow[];
  machines: PmPortfolioMachineRow[];
  oldestOpenOverdue: PmPortfolioOverdueCycle[];
}

type PmPortfolioComplianceClient = Pick<Prisma.TransactionClient, 'workOrderTaskExecution'>;

type MachineMetadata = {
  assetId: string;
  assetName: string;
  assetTag: string;
  departmentId: string | null;
  departmentName: string;
};

function compliancePct(completed: number, maturedCycles: number): number | null {
  if (maturedCycles === 0) return null;
  return Math.round((completed / maturedCycles) * 1000) / 10;
}

function oldestOpenMinutes(cycles: readonly PmComplianceCycle[]): number | null {
  const delays = cycles
    .filter((cycle) => cycle.outcome === 'overdue_open' && cycle.delayMinutes != null)
    .map((cycle) => cycle.delayMinutes as number);
  return delays.length > 0 ? Math.max(...delays) : null;
}

function riskCompare<T extends {
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
}>(left: T, right: T, leftName: string, rightName: string): number {
  if (right.openOverdue !== left.openOverdue) return right.openOverdue - left.openOverdue;
  if (right.missed !== left.missed) return right.missed - left.missed;

  const leftCompliance = left.completionCompliancePct;
  const rightCompliance = right.completionCompliancePct;
  if (leftCompliance == null && rightCompliance != null) return 1;
  if (leftCompliance != null && rightCompliance == null) return -1;
  if (leftCompliance != null && rightCompliance != null && leftCompliance !== rightCompliance) {
    return leftCompliance - rightCompliance;
  }

  return leftName.localeCompare(rightName);
}

function asComplianceRows(rows: readonly PmPortfolioComplianceExecutionRow[]): PmComplianceExecutionRow[] {
  return rows.map((row) => ({
    id: row.id,
    workOrderId: row.workOrderId,
    pmScheduleTaskId: row.pmScheduleTaskId,
    pmDueCycleKey: row.pmDueCycleKey,
    pmPlanningSnapshot: row.pmPlanningSnapshot,
    taskNumber: row.taskNumber,
    description: row.description,
    status: row.status,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    workOrder: row.workOrder,
    pmScheduleTask: row.pmScheduleTask
      ? {
          pmType: row.pmScheduleTask.pmType,
          maintenanceMode: row.pmScheduleTask.maintenanceMode,
        }
      : null,
  }));
}

export function summarizePmPortfolioCompliance(
  rows: PmPortfolioComplianceExecutionRow[],
  now: Date,
  windowDays?: number,
): PmPortfolioComplianceResult {
  const days = normalizePmComplianceWindowDays(windowDays);
  const empty = summarizePmComplianceExecutions([], now, days);
  const byAsset = new Map<string, { metadata: MachineMetadata; rows: PmPortfolioComplianceExecutionRow[] }>();

  for (const row of rows) {
    const asset = row.pmScheduleTask?.asset;
    if (!asset) continue;

    const metadata: MachineMetadata = {
      assetId: asset.id,
      assetName: asset.name,
      assetTag: asset.assetTag,
      departmentId: asset.departmentId,
      departmentName: asset.department?.name || 'Unassigned',
    };
    const existing = byAsset.get(asset.id);
    if (existing) existing.rows.push(row);
    else byAsset.set(asset.id, { metadata, rows: [row] });
  }

  const machines: PmPortfolioMachineRow[] = [];
  const overdueCycles: PmPortfolioOverdueCycle[] = [];
  const departmentBuckets = new Map<string, {
    departmentId: string | null;
    departmentName: string;
    machines: PmPortfolioMachineRow[];
  }>();

  for (const { metadata, rows: assetRows } of byAsset.values()) {
    const result = summarizePmComplianceExecutions(asComplianceRows(assetRows), now, days);
    if (result.summary.maturedCycles === 0) continue;

    const machine: PmPortfolioMachineRow = {
      ...metadata,
      maturedCycles: result.summary.maturedCycles,
      completed: result.summary.completed,
      openOverdue: result.summary.openOverdue,
      missed: result.summary.missed,
      completionCompliancePct: result.summary.completionCompliancePct,
      oldestOpenOverdueMinutes: oldestOpenMinutes(result.cycles),
    };
    machines.push(machine);

    const departmentKey = metadata.departmentId || '__unassigned__';
    const bucket = departmentBuckets.get(departmentKey);
    if (bucket) bucket.machines.push(machine);
    else {
      departmentBuckets.set(departmentKey, {
        departmentId: metadata.departmentId,
        departmentName: metadata.departmentName,
        machines: [machine],
      });
    }

    for (const cycle of result.cycles) {
      if (cycle.outcome !== 'overdue_open') continue;
      overdueCycles.push({ ...cycle, ...metadata });
    }
  }

  machines.sort((left, right) => riskCompare(left, right, left.assetName, right.assetName));

  const departments: PmPortfolioDepartmentRow[] = Array.from(departmentBuckets.values()).map((bucket) => {
    const maturedCycles = bucket.machines.reduce((sum, machine) => sum + machine.maturedCycles, 0);
    const completed = bucket.machines.reduce((sum, machine) => sum + machine.completed, 0);
    const openOverdue = bucket.machines.reduce((sum, machine) => sum + machine.openOverdue, 0);
    const missed = bucket.machines.reduce((sum, machine) => sum + machine.missed, 0);
    const overdueMinutes = bucket.machines
      .map((machine) => machine.oldestOpenOverdueMinutes)
      .filter((value): value is number => value != null);

    return {
      departmentId: bucket.departmentId,
      departmentName: bucket.departmentName,
      machineCount: bucket.machines.length,
      maturedCycles,
      completed,
      openOverdue,
      missed,
      completionCompliancePct: compliancePct(completed, maturedCycles),
      oldestOpenOverdueMinutes: overdueMinutes.length > 0 ? Math.max(...overdueMinutes) : null,
    };
  });

  departments.sort((left, right) => riskCompare(left, right, left.departmentName, right.departmentName));
  overdueCycles.sort((left, right) => {
    const delayDelta = (right.delayMinutes || 0) - (left.delayMinutes || 0);
    if (delayDelta !== 0) return delayDelta;
    const dueDelta = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    if (dueDelta !== 0) return dueDelta;
    return left.identity.localeCompare(right.identity);
  });

  const maturedCycles = machines.reduce((sum, machine) => sum + machine.maturedCycles, 0);
  const completed = machines.reduce((sum, machine) => sum + machine.completed, 0);
  const openOverdue = machines.reduce((sum, machine) => sum + machine.openOverdue, 0);
  const missed = machines.reduce((sum, machine) => sum + machine.missed, 0);

  return {
    window: empty.window,
    summary: {
      maturedCycles,
      completed,
      openOverdue,
      missed,
      completionCompliancePct: compliancePct(completed, maturedCycles),
      machinesWithMaturedCycles: machines.length,
      machinesWithOpenOverdue: machines.filter((machine) => machine.openOverdue > 0).length,
    },
    departments,
    machines,
    oldestOpenOverdue: overdueCycles.slice(0, 10),
  };
}

export async function getPmPortfolioCompliance(input: {
  client: PmPortfolioComplianceClient;
  plantId: string;
  departmentId?: string | null;
  now?: Date;
  windowDays?: number;
}): Promise<PmPortfolioComplianceResult> {
  const plantId = String(input.plantId || '').trim();
  if (!plantId) throw new Error('Plant is required');
  const departmentId = String(input.departmentId || '').trim() || null;
  const now = input.now ? new Date(input.now) : new Date();
  const windowDays = normalizePmComplianceWindowDays(input.windowDays);

  const assetFilter = {
    plantId,
    ...(departmentId ? { departmentId } : {}),
  };

  const rows = await input.client.workOrderTaskExecution.findMany({
    where: {
      pmScheduleTask: {
        is: {
          scheduleId: null,
          asset: { is: assetFilter },
        },
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
      pmScheduleTask: {
        select: {
          pmType: true,
          maintenanceMode: true,
          asset: {
            select: {
              id: true,
              name: true,
              assetTag: true,
              plantId: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return summarizePmPortfolioCompliance(rows as PmPortfolioComplianceExecutionRow[], now, windowDays);
}
