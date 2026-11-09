import { calculateTimeDayNextDueDate, isPmTimeUnit } from '@/lib/pm-frequency';
import type { PmForwardTask } from '@/lib/pm-forward-capacity';

/**
 * Optional modelling of FUTURE FIXED-CALENDAR REPEATS only.
 *
 * The first next-due occurrence is already counted by the PM forward plan;
 * these buckets never include that first due. An after-completion cycle cannot
 * be forecast without assuming when the technician will finish, and a meter
 * cycle cannot be forecast from usage that has not actually been observed.
 *
 * This model neither generates WOs nor changes PM due dates.
 */
export type PmFixedRecurrenceTask = PmForwardTask & {
  recurrenceBasis?: string | null;
  recurrenceAnchorDate?: string | null;
  frequencyInterval?: number | null;
  frequencyUnit?: string | null;
};
export interface PmFixedRepeatWeek {
  index: number;
  from: string;
  through: string;
  additionalOccurrences: number;
  estimatedMinutes: number;
  unestimatedOccurrences: number;
  highCriticalOccurrences: number;
}
export interface PmFixedRepeatForecast {
  weeks: PmFixedRepeatWeek[];
  summary: {
    eligibleFixedCalendarTasks: number;
    additionalOccurrences: number;
    estimatedMinutes: number;
    unestimatedOccurrences: number;
    afterCompletionExcluded: number;
    meterExcluded: number;
    overdueAwaitingCompletion: number;
    missingOrUnsupportedInterval: number;
    limited: boolean;
  };
}
const DAY = 86_400_000;
const LIMIT_PER_TASK = 10_000_000;
const INTERVAL_MS: Record<string, number> = {
  minutes: 60_000, hours: 3_600_000, days: DAY, weeks: 7 * DAY,
};
function date(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}
function midnightUtc(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function countRegularCycles(after: number, until: number, from: number, step: number): number {
  if (step <= 0 || until <= from) return 0;
  // n >= 1: the original, confirmed next-due occurrence is deliberately excluded.
  const first = Math.max(1, Math.ceil((from - after) / step));
  const exclusiveLast = Math.max(1, Math.ceil((until - after) / step));
  return Math.max(0, exclusiveLast - first);
}
export function projectFixedCalendarRepeats(
  tasks: readonly PmFixedRecurrenceTask[],
  days: 7 | 30 | 90,
  at: Date = new Date(),
): PmFixedRepeatForecast {
  const start = midnightUtc(at);
  const end = start + days * DAY;
  const weeks: PmFixedRepeatWeek[] = Array.from({ length: Math.ceil(days / 7) }, (_, i) => {
    const from = start + i * 7 * DAY;
    const until = Math.min(end, from + 7 * DAY);
    return {
      index: i,
      from: new Date(from).toISOString().slice(0, 10),
      through: new Date(until - DAY).toISOString().slice(0, 10),
      additionalOccurrences: 0, estimatedMinutes: 0,
      unestimatedOccurrences: 0, highCriticalOccurrences: 0,
    };
  });
  const summary: PmFixedRepeatForecast['summary'] = {
    eligibleFixedCalendarTasks: 0, additionalOccurrences: 0, estimatedMinutes: 0,
    unestimatedOccurrences: 0, afterCompletionExcluded: 0, meterExcluded: 0,
    overdueAwaitingCompletion: 0, missingOrUnsupportedInterval: 0, limited: false,
  };
  for (const task of tasks) {
    if (task.basis === 'meter') {
      summary.meterExcluded++;
      continue;
    }
    if (task.basis !== 'calendar') continue;
    if (task.recurrenceBasis !== 'fixed_schedule') {
      summary.afterCompletionExcluded++;
      continue;
    }
    const due = date(task.dueAt);
    if (due && due.getTime() < at.getTime()) {
      // Fixed-schedule cadence can only resume after a real overdue cycle
      // is reconciled, so do not imply its future jobs are already agreed.
      summary.overdueAwaitingCompletion++;
      continue;
    }
    const interval = task.frequencyInterval;
    const unit = task.frequencyUnit;
    if (!due || !Number.isInteger(interval) || !interval || interval <= 0
      || !isPmTimeUnit(unit)) {
      summary.missingOrUnsupportedInterval++;
      continue;
    }
    if (due.getTime() >= end) continue;
    summary.eligibleFixedCalendarTasks++;
    const estimate = task.estimatedMinutes != null && Number.isFinite(task.estimatedMinutes)
      && task.estimatedMinutes > 0 ? task.estimatedMinutes : null;
    const critical = task.assetCriticality === 'critical' || task.assetCriticality === 'high';
    const add = (index: number, count: number) => {
      if (count <= 0) return;
      const week = weeks[index];
      week.additionalOccurrences += count;
      summary.additionalOccurrences += count;
      if (estimate === null) {
        week.unestimatedOccurrences += count;
        summary.unestimatedOccurrences += count;
      } else {
        week.estimatedMinutes += count * estimate;
        summary.estimatedMinutes += count * estimate;
      }
      if (critical) week.highCriticalOccurrences += count;
    };
    if (unit in INTERVAL_MS) {
      const step = interval * INTERVAL_MS[unit];
      if (!Number.isSafeInteger(step) || step <= 0) {
        summary.missingOrUnsupportedInterval++;
        summary.eligibleFixedCalendarTasks--;
        continue;
      }
      const total = countRegularCycles(due.getTime(), end, start, step);
      if (total > LIMIT_PER_TASK) {
        summary.limited = true;
        continue;
      }
      for (let i = 0; i < weeks.length; i++) {
        const from = start + i * 7 * DAY;
        const until = Math.min(end, from + 7 * DAY);
        add(i, countRegularCycles(due.getTime(), until, from, step));
      }
      continue;
    }
    // Monthly / yearly recurrence uses the original fixed calendar anchor
    // when available, avoiding Feb-28 -> Mar-28 drift for Jan-31 schedules.
    const storedAnchor = date(task.recurrenceAnchorDate);
    const anchor = storedAnchor && storedAnchor <= due ? storedAnchor : due;
    const monthStep = unit === 'months' ? interval : interval * 12;
    const monthDelta = (due.getUTCFullYear() - anchor.getUTCFullYear()) * 12
      + due.getUTCMonth() - anchor.getUTCMonth();
    let n = Math.max(1, Math.floor(monthDelta / monthStep));
    let candidate = calculateTimeDayNextDueDate(anchor, interval * n, unit);
    while (candidate <= due && n < 20_000) {
      n++;
      candidate = calculateTimeDayNextDueDate(anchor, interval * n, unit);
    }
    let emitted = 0;
    while (candidate.getTime() < end && emitted < 100) {
      if (candidate.getTime() >= start) {
        const index = Math.floor((candidate.getTime() - start) / (7 * DAY));
        add(index, 1);
      }
      emitted++;
      n++;
      candidate = calculateTimeDayNextDueDate(anchor, interval * n, unit);
    }
    if (emitted >= 100 && candidate.getTime() < end) summary.limited = true;
  }
  return { weeks, summary };
}
