/** Plant-wide PM forward workload planning.
 * Forecasts ONE next occurrence per active assignment. Meter tasks are included
 * only when observed meter values have ALREADY reached the configured threshold.
 * No guessed run rates, approvals, shift schedules or completion claims.
 */
export type PmForwardBasis = 'calendar' | 'meter' | 'legacy_review';
export type PmCriticality = 'low' | 'medium' | 'high' | 'critical';
export interface PmForwardTask {
  id: string;
  assetId: string;
  assetName: string;
  assetCode: string;
  assetCriticality: string;
  assetStatus: string;
  plantId: string;
  plantName: string;
  componentId: string | null;
  componentName: string | null;
  componentCode: string | null;
  taskNumber: number;
  description: string;
  activityMode: string;
  equipmentState: string;
  basis: PmForwardBasis;
  dueAt: string | null;
  /** Optional server-observed recurrence: only fixed calendar is modelled. */
  recurrenceBasis?: string | null;
  recurrenceAnchorDate?: string | null;
  frequencyInterval?: number | null;
  frequencyUnit?: string | null;
  nextDueReading: number | null;
  meterValue: number | null;
  meterUnit: string | null;
  meterName: string | null;
  meterLastReadingAt: string | null;
  estimatedMinutes: number | null;
  openWorkOrder: { id: string; woNumber: string; status: string } | null;
}
export type PmForwardStatus =
  'overdue' | 'due_calendar' | 'due_meter' | 'later' |
  'needs_calendar_date' | 'needs_meter' | 'legacy_review';
export interface PmForwardRow extends PmForwardTask {
  status: PmForwardStatus;
  weekIndex: number | null;
  effortMinutes: number | null;
}
export interface PmForwardWeek {
  index: number;
  from: string;
  through: string;
  taskCount: number;
  knownMinutes: number;
  unknownEffortTasks: number;
  committedTasks: number;
  criticalTasks: number;
}
export interface PmForwardSummary {
  totalAssignments: number;
  dueTasks: number;
  overdueCalendar: number;
  meterDueNow: number;
  highOrCriticalDue: number;
  linkedOpenWorkOrders: number;
  awaitingWorkOrder: number;
  unestimatedDueTasks: number;
  calendarWithoutDate: number;
  meterWithoutLiveValue: number;
  legacyFrequencyForReview: number;
  knownMinutes: number;
}
export interface PmForwardResult {
  generatedAt: string;
  windowDays: 7 | 30 | 90;
  weeks: PmForwardWeek[];
  rows: PmForwardRow[];
  summary: PmForwardSummary;
}
export interface PmCapacityScenario {
  crews: number;
  hoursPerShift: number;
  workingDaysPerWeek: number;
  productivePercent: number;
}
const DAY = 86_400_000;
const STATUS_ORDER: Record<PmForwardStatus, number> = {
  overdue: 0, due_meter: 1, due_calendar: 2,
  needs_meter: 3, needs_calendar_date: 4, legacy_review: 5, later: 6,
};
const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
function validNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function validDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function workloadMinutes(minutes: number | null): number | null {
  const n = validNumber(minutes);
  // Missing, zero and negative estimates are NOT zero effort; don't fabricate capacity.
  return n !== null && n > 0 ? n : null;
}
export function buildPmForwardPlan(
  tasks: readonly PmForwardTask[],
  days: 7 | 30 | 90,
  now: Date = new Date(),
): PmForwardResult {
  const start = utcMidnight(now);
  const end = start.getTime() + days * DAY;
  const weeks: PmForwardWeek[] = Array.from({ length: Math.ceil(days / 7) }, (_, i) => {
    const from = new Date(start.getTime() + i * 7 * DAY);
    const through = new Date(Math.min(end, start.getTime() + (i + 1) * 7 * DAY) - DAY);
    return { index: i, from: from.toISOString().slice(0, 10), through: through.toISOString().slice(0, 10),
      taskCount: 0, knownMinutes: 0, unknownEffortTasks: 0, committedTasks: 0, criticalTasks: 0 };
  });
  const summary: PmForwardSummary = {
    totalAssignments: tasks.length, dueTasks: 0, overdueCalendar: 0,
    meterDueNow: 0, highOrCriticalDue: 0, linkedOpenWorkOrders: 0,
    awaitingWorkOrder: 0, unestimatedDueTasks: 0, calendarWithoutDate: 0,
    meterWithoutLiveValue: 0, legacyFrequencyForReview: 0, knownMinutes: 0,
  };
  const rows: PmForwardRow[] = [];
  for (const task of tasks) {
    let status: PmForwardStatus = 'later';
    let weekIndex: number | null = null;
    const estimated = workloadMinutes(task.estimatedMinutes);
    if (task.basis === 'calendar') {
      const due = validDate(task.dueAt);
      if (!due) {
        status = 'needs_calendar_date';
        summary.calendarWithoutDate++;
      } else if (due.getTime() < now.getTime()) {
        status = 'overdue';
        weekIndex = 0;
        summary.overdueCalendar++;
      } else if (due.getTime() < end) {
        status = 'due_calendar';
        weekIndex = Math.min(weeks.length - 1, Math.max(0,
          Math.floor((due.getTime() - start.getTime()) / (7 * DAY))));
      }
    } else if (task.basis === 'meter') {
      const reading = validNumber(task.meterValue);
      const target = validNumber(task.nextDueReading);
      if (reading === null || target === null) {
        status = 'needs_meter';
        summary.meterWithoutLiveValue++;
      } else if (reading >= target) {
        status = 'due_meter';
        weekIndex = 0;
        summary.meterDueNow++;
      }
      // Meter future dates are NEVER inferred from a usage rate we do not have.
    } else {
      status = 'legacy_review';
      summary.legacyFrequencyForReview++;
    }
    if (weekIndex !== null) {
      const week = weeks[weekIndex];
      summary.dueTasks++;
      week.taskCount++;
      if (estimated === null) {
        week.unknownEffortTasks++;
        summary.unestimatedDueTasks++;
      } else {
        week.knownMinutes += estimated;
        summary.knownMinutes += estimated;
      }
      if (task.openWorkOrder) {
        week.committedTasks++;
        summary.linkedOpenWorkOrders++;
      } else {
        summary.awaitingWorkOrder++;
      }
      if (task.assetCriticality === 'high' || task.assetCriticality === 'critical') {
        summary.highOrCriticalDue++;
        week.criticalTasks++;
      }
    }
    rows.push({ ...task, status, weekIndex, effortMinutes: estimated });
  }
  rows.sort((a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || (RISK_ORDER[a.assetCriticality] ?? 4) - (RISK_ORDER[b.assetCriticality] ?? 4)
    || (a.dueAt || '').localeCompare(b.dueAt || '')
    || a.assetName.localeCompare(b.assetName)
    || a.taskNumber - b.taskNumber
    || a.id.localeCompare(b.id));
  return { generatedAt: now.toISOString(), windowDays: days, weeks, rows, summary };
}
export function pmCapacityForWeek(
  week: Pick<PmForwardWeek, 'from' | 'through' | 'knownMinutes'>,
  capacity: PmCapacityScenario,
): { availableHours: number; demandHours: number; loadPercent: number | null; overCapacity: boolean } {
  const start = validDate(week.from + 'T00:00:00.000Z');
  const end = validDate(week.through + 'T00:00:00.000Z');
  const workdays = Math.max(1, Math.min(7, Math.trunc(capacity.workingDaysPerWeek)));
  let days = 0;
  if (start && end && end >= start && end.getTime() - start.getTime() <= 14 * DAY) {
    for (let at = start.getTime(); at <= end.getTime(); at += DAY) {
      const dow = new Date(at).getUTCDay();
      if (workdays === 7 || (dow !== 0 && dow <= workdays)) days++;
    }
  }
  const crews = Number.isFinite(capacity.crews) ? Math.max(0, Math.min(100, capacity.crews)) : 0;
  const shift = Number.isFinite(capacity.hoursPerShift) ? Math.max(0, Math.min(24, capacity.hoursPerShift)) : 0;
  const efficiency = Number.isFinite(capacity.productivePercent) ?
    Math.max(0, Math.min(100, capacity.productivePercent)) / 100 : 0;
  const availableHours = Math.round(crews * shift * efficiency * days * 100) / 100;
  const demandHours = Math.round(week.knownMinutes / 60 * 100) / 100;
  return { availableHours, demandHours,
    loadPercent: availableHours > 0 ? Math.round(demandHours / availableHours * 100) : null,
    overCapacity: demandHours > availableHours };
}
