export interface WorkOrderConversionDefaults {
  scheduledDate: string;
  expectedEndDate: string;
}

/** Format a Date as YYYY-MM-DD using the browser/runtime local calendar date. */
export function toLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format a Date as YYYY-MM-DDTHH:mm using local clock time (never UTC). */
export function toLocalDateTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${toLocalDateInput(date)}T${hours}:${minutes}`;
}

/**
 * Defaults used when a planner opens MR -> WO conversion.
 * - schedule starts at the current local date/time
 * - expected end date starts on the current local date
 */
export function getWorkOrderConversionDefaults(now: Date = new Date()): WorkOrderConversionDefaults {
  return {
    scheduledDate: toLocalDateTimeInput(now),
    expectedEndDate: toLocalDateInput(now),
  };
}

/**
 * Build the inventory list URL for a maintenance request.
 * The request's persisted plant is authoritative during WO conversion.
 */
export function getRequestInventoryUrl(plantId?: string | null): string {
  const base = '/api/inventory?limit=100';
  return plantId ? `${base}&plantId=${encodeURIComponent(plantId)}` : base;
}
