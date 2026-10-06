import type { Prisma } from '@prisma/client';

type TriggerConfig = Record<string, unknown>;

export interface PmTriggerRearmResult {
  rearmed: boolean;
  triggerId?: string;
  triggerType?: string;
  reason?: string;
}

function parseConfig(raw: string | null | undefined): TriggerConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as TriggerConfig
      : {};
  } catch {
    return {};
  }
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clearGenerationMarker(config: TriggerConfig): TriggerConfig {
  const next = { ...config };
  delete next.lastGeneratedWorkOrderId;
  delete next.lastGeneratedPreviousBaselineHours;
  delete next.lastGeneratedPreviousBaselineCount;
  delete next.lastGeneratedPreviousReadingId;
  delete next.lastGeneratedPreviousConditionMatched;
  return next;
}

export function buildRearmedTriggerConfig(
  triggerType: string,
  config: TriggerConfig,
  workOrderId: string,
): TriggerConfig | null {
  if (config.lastGeneratedWorkOrderId !== workOrderId) return null;

  const next = clearGenerationMarker(config);

  if (triggerType === 'meter') {
    const previous = finiteNumber(config.lastGeneratedPreviousBaselineHours);
    if (previous == null) return null;
    next.baselineHours = previous;
    return next;
  }

  if (triggerType === 'production_count') {
    const previous = finiteNumber(config.lastGeneratedPreviousBaselineCount);
    if (previous == null) return null;
    next.baselineCount = previous;
    return next;
  }

  if (triggerType === 'condition') {
    next.lastReadingId = config.lastGeneratedPreviousReadingId ?? null;
    next.lastConditionMatched = config.lastGeneratedPreviousConditionMatched === true;
    return next;
  }

  return null;
}

export async function rearmRuntimePmTriggerAfterCancellation(
  tx: Prisma.TransactionClient,
  workOrder: { id: string; pmScheduleId: string | null },
): Promise<PmTriggerRearmResult> {
  if (!workOrder.pmScheduleId) return { rearmed: false, reason: 'Work order is not linked to a PM schedule' };

  const candidate = await tx.pmTrigger.findUnique({
    where: { scheduleId: workOrder.pmScheduleId },
    select: { id: true, triggerType: true },
  });
  if (!candidate || !['meter', 'condition', 'production_count'].includes(candidate.triggerType)) {
    return { rearmed: false, reason: 'No runtime trigger is linked to the PM schedule' };
  }

  const lockKey = candidate.triggerType === 'meter'
    ? `iassetspro:pm-meter:${candidate.id}`
    : `iassetspro:pm-signal:${candidate.id}`;
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', lockKey);

  const trigger = await tx.pmTrigger.findUnique({
    where: { id: candidate.id },
    select: { id: true, scheduleId: true, triggerType: true, triggerConfig: true },
  });
  if (!trigger || trigger.scheduleId !== workOrder.pmScheduleId) {
    return { rearmed: false, reason: 'PM trigger changed during cancellation' };
  }

  const config = parseConfig(trigger.triggerConfig);
  const nextConfig = buildRearmedTriggerConfig(trigger.triggerType, config, workOrder.id);
  if (!nextConfig) {
    return {
      rearmed: false,
      triggerId: trigger.id,
      triggerType: trigger.triggerType,
      reason: 'Cancelled work order is not the trigger generation currently armed for rollback',
    };
  }

  await tx.pmTrigger.update({
    where: { id: trigger.id },
    data: { triggerConfig: JSON.stringify(nextConfig) },
  });

  return { rearmed: true, triggerId: trigger.id, triggerType: trigger.triggerType };
}
