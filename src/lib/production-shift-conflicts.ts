/**
 * Detect overlapping machine / worker schedules before a planner replaces the roster.
 * Shift dates identify the START day; an end at or before the start is on the next UTC day.
 * Production operations here use the factory's Ghana (GMT/UTC) shift clock.
 */
type ExistingSchedule = {
  id: string;
  assetId: string;
  shiftTemplateId: string;
  productionDate: Date;
  startsAt: string | null;
  endsAt: string | null;
  shift: { startsAt: string | null; endsAt: string | null };
  crew: ReadonlyArray<{ userId: string }>;
};
type CandidateSchedule = {
  assetId: string;
  shiftTemplateId: string;
  productionDate: Date;
  startsAt: string;
  endsAt: string;
  crewUserIds: ReadonlyArray<string>;
};

type Collision = { kind: 'machine' | 'worker'; date: string };
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const dateText = (date: Date) => date.toISOString().slice(0, 10);

function shiftRange(date: Date, start: string | null, end: string | null) {
  if (!start || !end || !timePattern.test(start) || !timePattern.test(end) || start === end) return null;
  const day = dateText(date);
  const startMs = Date.parse(day + 'T' + start + ':00.000Z');
  let endMs = Date.parse(day + 'T' + end + ':00.000Z');
  if (endMs <= startMs) endMs += 86_400_000;
  return { startMs, endMs };
}

export function findProductionShiftConflict(
  candidate: CandidateSchedule,
  existing: ReadonlyArray<ExistingSchedule>,
): Collision | null {
  const requested = shiftRange(candidate.productionDate, candidate.startsAt, candidate.endsAt);
  if (!requested) throw new Error('Planned shift times must be valid, distinct HH:mm values');
  const assigned = new Set(candidate.crewUserIds);
  const candidateDay = dateText(candidate.productionDate);

  for (const plan of existing) {
    const existingDay = dateText(plan.productionDate);
    // Editing this exact plan is permitted; duplicates of the same composite key
    // are prohibited by the production_shift_plans database unique constraint.
    if (plan.assetId === candidate.assetId
      && plan.shiftTemplateId === candidate.shiftTemplateId
      && existingDay === candidateDay) continue;

    const sameMachine = plan.assetId === candidate.assetId;
    const sharedWorker = plan.crew.some(worker => assigned.has(worker.userId));
    if (!sameMachine && !sharedWorker) continue;

    const prior = shiftRange(plan.productionDate,
      plan.startsAt || plan.shift.startsAt,
      plan.endsAt || plan.shift.endsAt);
    // Do not silently double-book an un-timed legacy schedule on the same date.
    if (!prior) {
      if (existingDay === candidateDay) return { kind: sameMachine ? 'machine' : 'worker', date: existingDay };
      continue;
    }

    if (requested.startMs < prior.endMs && prior.startMs < requested.endMs) {
      return { kind: sameMachine ? 'machine' : 'worker', date: existingDay };
    }
  }
  return null;
}
