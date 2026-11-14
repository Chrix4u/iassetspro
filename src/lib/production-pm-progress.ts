/** Read-only PM meter progress: never creates, resets, or advances a PM schedule. */
export type ProductionPmProgressState = 'awaiting_reading' | 'upcoming' | 'approaching' | 'due';

export function calculateProductionPmProgress(input: {
  current: number | null;
  nextDue: number;
  interval: number | null;
}): {
  state: ProductionPmProgressState;
  currentValue: number | null;
  nextDueReading: number;
  remaining: number | null;
  progressPercent: number | null;
} {
  const { current, nextDue, interval } = input;
  if (!Number.isFinite(nextDue) || nextDue < 0) {
    throw new Error('PM next due meter reading must be nonnegative and finite');
  }
  if (current === null || !Number.isFinite(current) || current < 0) {
    return { state: 'awaiting_reading', currentValue: null, nextDueReading: nextDue, remaining: null, progressPercent: null };
  }
  const remaining = Math.max(0, nextDue - current);
  const usableInterval = interval !== null && Number.isFinite(interval) && interval > 0 ? interval : null;
  const progressPercent = usableInterval === null ? null :
    Math.min(100, Math.max(0, 100 * (current - (nextDue - usableInterval)) / usableInterval));
  const state: ProductionPmProgressState = remaining === 0
    ? 'due'
    : progressPercent !== null && progressPercent >= 80 ? 'approaching' : 'upcoming';
  return { state, currentValue: current, nextDueReading: nextDue, remaining, progressPercent };
}
