import type { Prisma } from '@prisma/client';
import { calculateTimeDayNextDueDate, type PmTimeUnit } from '@/lib/pm-frequency';

export const TBM_TIME_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type TbmTimeUnit = (typeof TBM_TIME_UNITS)[number];

const tbmUnits = new Set<string>(TBM_TIME_UNITS);
const DAY_MS = 24 * 60 * 60 * 1000;

function assertValidDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
}

export function calculateNextTbmDueDate(fromDate: Date, interval: number, unit: TbmTimeUnit): Date {
  assertValidDate(fromDate, 'TBM recurrence start');
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error('TBM interval must be a positive whole number');
  }
  if (!tbmUnits.has(unit)) {
    throw new Error('TBM unit must be days, weeks, months, or years');
  }
  return calculateTimeDayNextDueDate(fromDate, interval, unit as PmTimeUnit);
}

export interface TbmDueStateInput {
  now: Date;
  nextDueDate: Date;
  leadDays: number;
}

export interface TbmDueState {
  dueForGeneration: boolean;
  overdue: boolean;
  nextDueDate: Date;
  leadWindowEnd: Date;
}

export function evaluateTbmDueState(input: TbmDueStateInput): TbmDueState {
  assertValidDate(input.now, 'TBM evaluation time');
  assertValidDate(input.nextDueDate, 'TBM next due date');
  if (!Number.isInteger(input.leadDays) || input.leadDays < 0) {
    throw new Error('TBM lead days must be a non-negative whole number');
  }

  const nextDueDate = new Date(input.nextDueDate);
  const leadWindowEnd = new Date(input.now.getTime() + input.leadDays * DAY_MS);
  return {
    dueForGeneration: nextDueDate.getTime() <= leadWindowEnd.getTime(),
    overdue: nextDueDate.getTime() < input.now.getTime(),
    nextDueDate,
    leadWindowEnd,
  };
}

export interface EvaluateDueTbmScheduleTasksOptions {
  now?: Date;
  /** Omit for trusted system-wide evaluation. An explicit empty array evaluates no plants. */
  plantIds?: string[];
}

export interface TbmDueTaskResult extends TbmDueState {
  scheduleTaskId: string;
  scheduleId: string;
  pmTaskId: string;
  sortOrder: number;
  taskNumber: number;
  taskDescription: string;
  scheduleTitle: string;
  assetId: string;
  componentId: string | null;
  plantId: string;
  assetName: string;
  assetTag: string;
}

type TbmEvaluationClient = Pick<Prisma.TransactionClient, 'pmScheduleTask'>;

export async function evaluateDueTbmScheduleTasks(
  client: TbmEvaluationClient,
  options: EvaluateDueTbmScheduleTasksOptions = {},
): Promise<{ evaluated: number; due: number; overdue: number; results: TbmDueTaskResult[] }> {
  const now = options.now ? new Date(options.now) : new Date();
  assertValidDate(now, 'TBM evaluation time');

  const scheduleWhere: Prisma.PmScheduleWhereInput = {
    isActive: true,
    recurrenceAuthority: 'task',
    ...(options.plantIds !== undefined
      ? { asset: { plantId: { in: options.plantIds } } }
      : {}),
  };

  const rows = await client.pmScheduleTask.findMany({
    where: {
      isActive: true,
      maintenanceMode: 'tbm',
      nextDueDate: { not: null },
      schedule: scheduleWhere,
    },
    select: {
      id: true,
      scheduleId: true,
      pmTaskId: true,
      sortOrder: true,
      leadDays: true,
      frequencyInterval: true,
      frequencyUnit: true,
      lastCompletedAt: true,
      nextDueDate: true,
      pmTask: { select: { taskNumber: true, description: true } },
      schedule: {
        select: {
          title: true,
          assetId: true,
          componentId: true,
          asset: { select: { plantId: true, name: true, assetTag: true } },
        },
      },
    },
    orderBy: [{ nextDueDate: 'asc' }, { sortOrder: 'asc' }],
  });

  const results: TbmDueTaskResult[] = [];
  for (const row of rows) {
    if (!row.nextDueDate) continue;
    const dueState = evaluateTbmDueState({ now, nextDueDate: row.nextDueDate, leadDays: row.leadDays });
    results.push({
      scheduleTaskId: row.id,
      scheduleId: row.scheduleId,
      pmTaskId: row.pmTaskId,
      sortOrder: row.sortOrder,
      taskNumber: row.pmTask.taskNumber,
      taskDescription: row.pmTask.description,
      scheduleTitle: row.schedule.title,
      assetId: row.schedule.assetId,
      componentId: row.schedule.componentId,
      plantId: row.schedule.asset.plantId,
      assetName: row.schedule.asset.name,
      assetTag: row.schedule.asset.assetTag,
      ...dueState,
    });
  }

  return {
    evaluated: results.length,
    due: results.filter((row) => row.dueForGeneration).length,
    overdue: results.filter((row) => row.overdue).length,
    results,
  };
}
