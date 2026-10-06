export function calculatePmPlannedEnd(
  plannedStart: Date,
  estimatedHours: number | null | undefined,
): Date | null {
  const hours = Number(estimatedHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return new Date(plannedStart.getTime() + hours * 60 * 60 * 1000);
}
