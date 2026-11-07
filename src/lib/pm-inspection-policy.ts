/**
 * PM inspection evaluation is separate from PM recurrence. A recorded inspection
 * must never advance PmScheduleTask.nextDueDate or nextDueReading.
 */
export type InspectionMethod = 'visual' | 'measurement' | 'functional' | 'dimensional' | 'ndt';
export type InspectionResult = 'pass' | 'conditional' | 'needs_attention' | 'fail';
export type InspectionDueState = 'overdue' | 'due_soon' | 'scheduled' | 'meter_due' | 'meter_waiting' | 'unplanned';

export const INSPECTION_METHODS: readonly InspectionMethod[] = [
  'visual', 'measurement', 'functional', 'dimensional', 'ndt',
] as const;
export const INSPECTION_RESULTS: readonly InspectionResult[] = [
  'pass', 'conditional', 'needs_attention', 'fail',
] as const;

export function parseInspectionRange(value: unknown): { min: number | null; max: number | null; unit: string } | null {
  if (!value) return null;
  try {
    const raw: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const parseBound = (input: unknown): number | null =>
      input === null || input === undefined || input === '' ? null :
        typeof input === 'number' || typeof input === 'string' && input.trim()
          ? Number.isFinite(Number(input)) ? Number(input) : null
          : null;
    const min = parseBound(item.min);
    const max = parseBound(item.max);
    if (min === null && max === null) return null;
    if (min !== null && max !== null && min > max) return null;
    return { min, max, unit: String(item.unit || '').slice(0, 40) };
  } catch { return null; }
}

export function classifyInspection(input: {
  method: InspectionMethod;
  requestedResult: InspectionResult;
  value?: unknown;
  normalRange?: unknown;
}): { result: InspectionResult; value: string | null; exceededLimit: boolean; range: ReturnType<typeof parseInspectionRange> } {
  const range = parseInspectionRange(input.normalRange);
  const requiresNumber = input.method === 'measurement' || input.method === 'dimensional';
  const value = input.value === null || input.value === undefined ? '' : String(input.value).trim();
  if (requiresNumber && (value === '' || !Number.isFinite(Number(value)))) {
    throw new Error('A numeric instrument reading is required');
  }
  if (value.length > 100) throw new Error('Inspection value is too long');
  const numeric = value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const exceededLimit = Boolean(range && numeric !== null && (
    (range.min !== null && numeric < range.min) || (range.max !== null && numeric > range.max)
  ));
  // An out-of-tolerance reading may never be recorded as passing.
  return {
    result: exceededLimit ? 'fail' : input.requestedResult,
    value: value || null,
    exceededLimit,
    range,
  };
}

export function isCorrectiveInspectionResult(result: InspectionResult): boolean {
  return result === 'fail' || result === 'needs_attention';
}

export function inspectionDueState(input: {
  basis: string | null;
  nextDueDate: Date | string | null;
  nextDueReading: number | null;
  currentMeterValue: number | null;
  now?: Date;
}): InspectionDueState {
  const now = input.now || new Date();
  if (input.basis === 'meter') {
    if (input.nextDueReading === null || input.currentMeterValue === null) return 'unplanned';
    return input.currentMeterValue >= input.nextDueReading ? 'meter_due' : 'meter_waiting';
  }
  if (!input.nextDueDate) return 'unplanned';
  const due = new Date(input.nextDueDate).getTime();
  if (!Number.isFinite(due)) return 'unplanned';
  if (due < now.getTime()) return 'overdue';
  if (due <= now.getTime() + 7 * 86400000) return 'due_soon';
  return 'scheduled';
}
