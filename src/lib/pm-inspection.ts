/** Rules shared by the PM inspection planner, technician entry, and closeout. */
export type PmInspectionMethod = 'visual' | 'measurement';
export type PmInspectionOutcome = 'pass' | 'fail' | 'needs_attention';
export type PmInspectionDueState = 'overdue' | 'due_today' | 'upcoming' | 'unscheduled';

export interface InspectionLimits {
  min: number | null;
  max: number | null;
  unit: string | null;
  warningMin?: number | null;
  warningMax?: number | null;
}

export function parseInspectionLimits(source: string | null): InspectionLimits {
  if (!source) return { min: null, max: null, unit: null };
  try {
    const parsed = JSON.parse(source) as Record<string, unknown>;
    const min = typeof parsed.min === 'number' && Number.isFinite(parsed.min) ? parsed.min : null;
    const max = typeof parsed.max === 'number' && Number.isFinite(parsed.max) ? parsed.max : null;
    const unit = typeof parsed.unit === 'string' && parsed.unit.trim() ? parsed.unit.trim() : null;
    const warningMin = typeof parsed.warningMin === 'number' && Number.isFinite(parsed.warningMin) ? parsed.warningMin : null;
    const warningMax = typeof parsed.warningMax === 'number' && Number.isFinite(parsed.warningMax) ? parsed.warningMax : null;
    // Invalid or stale warning bands are deliberately ignored, never silently
    // interpreted as valid configured warning thresholds.
    const ordered = (warningMin === null || warningMax === null || warningMin <= warningMax)
      && (min === null || warningMin === null || warningMin >= min)
      && (max === null || warningMax === null || warningMax <= max)
      && (min === null || warningMax === null || warningMax >= min)
      && (max === null || warningMin === null || warningMin <= max);
    return {
      min, max, unit,
      ...(ordered && warningMin !== null ? { warningMin } : {}),
      ...(ordered && warningMax !== null ? { warningMax } : {}),
    };
  } catch {
    return { min: null, max: null, unit: null };
  }
}

/** The instrument's approved numeric limits—not an operator's OK selection—determine its status.
 * Return null when no numeric reading or approved limits exist: a missing
 * threshold must never be mistaken for evidence that a machine is healthy.
 * Visual checks retain a human assessment. */
export function automaticMeasurementOutcome(
  rawValue: string | number | null | undefined,
  normalRange: string | null,
): PmInspectionOutcome | null {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') return null;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  const { min, max, warningMin, warningMax } = parseInspectionLimits(normalRange);
  if (min === null && max === null) return null;
  if ((min !== null && value < min) || (max !== null && value > max)) return 'fail';
  if ((warningMin != null && value < warningMin) || (warningMax != null && value > warningMax)) return 'needs_attention';
  return 'pass';
}

export function inspectionDueState(nextInspection: Date | string | null, now: Date = new Date()): PmInspectionDueState {
  if (!nextInspection) return 'unscheduled';
  const date = new Date(nextInspection);
  if (!Number.isFinite(date.getTime())) return 'unscheduled';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getTime() < today.getTime()) return 'overdue';
  if (date.getTime() < tomorrow.getTime()) return 'due_today';
  return 'upcoming';
}

/** Used for component inspection checkpoints, distinct from PM assignment cadence. */
export function nextInspectionDate(from: Date, frequency: string): Date | null {
  const date = new Date(from);
  if (Number.isNaN(date.getTime())) return null;
  switch (frequency) {
    case 'hourly': date.setHours(date.getHours() + 1); break;
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'monthly': {
      const anchorDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + 1);
      date.setDate(Math.min(anchorDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
      break;
    }
    case 'quarterly': {
      const anchorDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + 3);
      date.setDate(Math.min(anchorDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
      break;
    }
    case 'annually': {
      const anchorDay = date.getDate();
      const anchorMonth = date.getMonth();
      date.setDate(1);
      date.setFullYear(date.getFullYear() + 1);
      date.setMonth(anchorMonth);
      date.setDate(Math.min(anchorDay, new Date(date.getFullYear(), anchorMonth + 1, 0).getDate()));
      break;
    }
    default: return null; // unknown/per_start must not silently advance
  }
  return date;
}

export const PM_INSPECTION_FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'annually'] as const;
export const PM_INSPECTION_RESULTS = ['pass', 'fail', 'needs_attention'] as const;

/** Never silently turn an alarming numeric reading into a passing result. */
export function evaluateInspectionResult(
  method: PmInspectionMethod,
  rawValue: unknown,
  reportedOutcome: PmInspectionOutcome,
  limits: InspectionLimits,
): { value: string | null; numericValue: number | null; outcome: PmInspectionOutcome; isAlarm: boolean } {
  if (!PM_INSPECTION_RESULTS.includes(reportedOutcome)) throw new Error('Invalid inspection result');
  if (method === 'visual') {
    return { value: null, numericValue: null, outcome: reportedOutcome, isAlarm: reportedOutcome !== 'pass' };
  }
  if (typeof rawValue !== 'number' && (typeof rawValue !== 'string' || rawValue.trim() === '')) {
    throw new Error('Instrument inspection requires a numeric reading');
  }
  const number = Number(rawValue);
  if (!Number.isFinite(number)) throw new Error('Instrument inspection requires a finite numeric reading');
  const outside = (limits.min !== null && number < limits.min)
    || (limits.max !== null && number > limits.max);
  const warning = !outside && (
    (limits.warningMin != null && number < limits.warningMin)
    || (limits.warningMax != null && number > limits.warningMax)
  );
  return {
    value: String(number),
    numericValue: number,
    outcome: outside ? 'fail' : warning ? 'needs_attention' : reportedOutcome,
    isAlarm: outside || warning || reportedOutcome !== 'pass',
  };
}
