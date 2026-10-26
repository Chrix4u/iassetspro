import { normalizePmFrequency } from '@/lib/pm-frequency';

export const LEGACY_TBM_TASK_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type LegacyTbmTaskUnit = (typeof LEGACY_TBM_TASK_UNITS)[number];

export interface LegacyHeaderCadenceInput {
  frequencyType: string;
  frequencyValue: number;
  frequencyUnit?: string | null;
  meterName?: string | null;
}

export interface LegacyHeaderTbmCadence {
  frequencyInterval: number;
  frequencyUnit: LegacyTbmTaskUnit;
}

const taskUnits = new Set<string>(LEGACY_TBM_TASK_UNITS);

export function resolveLegacyHeaderTbmCadence(input: LegacyHeaderCadenceInput): LegacyHeaderTbmCadence | null {
  if (!Number.isInteger(input.frequencyValue) || input.frequencyValue <= 0) return null;

  const normalized = normalizePmFrequency(input);
  if (normalized.frequencyType !== 'time_day' || !taskUnits.has(normalized.frequencyUnit)) return null;

  return {
    frequencyInterval: normalized.frequencyValue,
    frequencyUnit: normalized.frequencyUnit as LegacyTbmTaskUnit,
  };
}

interface LegacyTbmShadowClient {
  pmScheduleTask: {
    updateMany(args: {
      where: { scheduleId: string; maintenanceMode: 'tbm' };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

export interface LegacyTbmShadowInput extends LegacyHeaderCadenceInput {
  scheduleId: string;
  leadDays: number;
  lastCompletedDate: Date | null;
  nextDueDate: Date | null;
}

export async function syncLegacyTbmShadowState(
  client: LegacyTbmShadowClient,
  input: LegacyTbmShadowInput,
): Promise<void> {
  const cadence = resolveLegacyHeaderTbmCadence(input);
  const where = { scheduleId: input.scheduleId, maintenanceMode: 'tbm' as const };

  if (!cadence) {
    await client.pmScheduleTask.updateMany({ where, data: { isActive: false } });
    return;
  }

  await client.pmScheduleTask.updateMany({
    where,
    data: {
      frequencyInterval: cadence.frequencyInterval,
      frequencyUnit: cadence.frequencyUnit,
      leadDays: input.leadDays,
      lastCompletedAt: input.lastCompletedDate,
      nextDueDate: input.nextDueDate,
      isActive: true,
    },
  });
}
