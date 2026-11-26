import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

type AssetMeterClient = Pick<Prisma.TransactionClient, 'assetMeter' | 'meterReading'>;

export type NormalizedAssetMeterInput = {
  name: string;
  unit: string;
  meterType: string;
  initialValue: number;
  initialReadingProvided: boolean;
};

export type NormalizeAssetMeterInputResult =
  | { ok: true; value: NormalizedAssetMeterInput }
  | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeAssetMeterInput(input: unknown): NormalizeAssetMeterInputResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Meter definition is required' };
  }
  const raw = input as Record<string, unknown>;
  const name = text(raw.name);
  if (!name) return { ok: false, error: 'Meter name is required' };
  const unit = text(raw.unit);
  if (!unit) return { ok: false, error: 'Meter unit is required' };
  const meterType = text(raw.meterType).toLowerCase() || 'general';
  const initialReadingProvided = raw.initialValue !== undefined && raw.initialValue !== null && raw.initialValue !== '';
  const initialRaw = initialReadingProvided ? Number(raw.initialValue) : 0;
  if (!Number.isFinite(initialRaw) || initialRaw < 0) return { ok: false, error: 'Initial reading must be a nonnegative number' };
  return { ok: true, value: { name, unit, meterType, initialValue: initialRaw, initialReadingProvided } };
}

export async function listAssetMeters(client: AssetMeterClient, assetId: string) {
  return client.assetMeter.findMany({
    where: { assetId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { unit: 'asc' }],
  });
}

/** Persist only explicit opening observations, not default zero values.
 * Call within the same transaction as creation of these new meter rows.
 * An opening baseline is not production consumption.
 */
export async function persistOpeningMeterReadings(
  client: Pick<AssetMeterClient, 'meterReading'>,
  input: { assetId: string; plantId: string; actorId: string; meters: Array<{
    id: string; name: string; unit: string; currentValue: number; lastReadingAt: Date | null;
  }> },
) {
  const data = input.meters.flatMap(meter => meter.lastReadingAt === null ? [] : [{
    readingNumber: 'MR-OPEN-' + randomUUID(),
    assetId: input.assetId, assetMeterId: meter.id, plantId: input.plantId,
    meterName: meter.name, unit: meter.unit, value: meter.currentValue,
    readingDate: meter.lastReadingAt, previousValue: null, consumption: 0,
    notes: 'Opening observed meter baseline at registration', readById: input.actorId,
  }]);
  if (data.length) await client.meterReading.createMany({ data });
}

export async function createAssetMeter(
  client: AssetMeterClient,
  input: { assetId: string; actorId: string; plantId: string; definition: unknown },
) {
  const normalized = normalizeAssetMeterInput(input.definition);
  if (!normalized.ok) throw new Error(normalized.error);
  const { name, unit, meterType, initialValue, initialReadingProvided } = normalized.value;
  const meter = await client.assetMeter.create({
    data: {
      assetId: input.assetId,
      name,
      unit,
      meterType,
      currentValue: initialValue,
      lastReadingAt: initialReadingProvided ? new Date() : null,
      createdById: input.actorId,
    },
  });
  await persistOpeningMeterReadings(client, { assetId: input.assetId, plantId: input.plantId, actorId: input.actorId, meters: [meter] });
  return meter;
}

/**
 * Authoritative cumulative meters must progress in value and observation time.
 * Never turn an empty or invalid reading into zero. A physical counter reset
 * requires a separately audited replacement workflow, not a normal reading.
 */
export function validateAssetMeterReading(
  meter: { currentValue: number; lastReadingAt: Date | null },
  rawValue: unknown,
  rawDate?: unknown,
  now = new Date(),
): { value: number; readingDate: Date; previousValue: number } {
  if (rawValue === undefined || rawValue === null
    || (typeof rawValue === 'string' && rawValue.trim() === '')) {
    throw new Error('Reading value is required');
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Reading value must be a nonnegative number');
  }
  const readingDate = rawDate === undefined || rawDate === null || rawDate === ''
    ? now : new Date(String(rawDate));
  if (Number.isNaN(readingDate.getTime())) throw new Error('Reading date is invalid');
  if (readingDate.getTime() > now.getTime() + 5 * 60_000) {
    throw new Error('Reading date cannot be more than five minutes in the future');
  }
  if (meter.lastReadingAt && readingDate.getTime() <= meter.lastReadingAt.getTime()) {
    throw new Error('Reading date must be later than the previous meter observation');
  }
  const previousValue = Number(meter.currentValue);
  if (!Number.isFinite(previousValue)) throw new Error('Stored meter value is invalid');
  if (value < previousValue) {
    throw new Error('Cumulative meter reading cannot decrease; use a controlled meter replacement process');
  }
  return { value, readingDate, previousValue };
}

export async function recordAssetMeterReading(
  client: AssetMeterClient,
  input: {
    assetId: string;
    meterId: string;
    value: unknown;
    readingDate?: unknown;
    notes?: unknown;
    actorId: string;
    plantId: string;
    readingNumber: string;
  },
) {
  const meter = await client.assetMeter.findUnique({ where: { id: input.meterId } });
  if (!meter || meter.assetId !== input.assetId || !meter.isActive) {
    throw new Error('Meter does not belong to this asset or is inactive');
  }
  const { value, readingDate, previousValue } = validateAssetMeterReading(
    meter, input.value, input.readingDate,
  );
  // Compare-and-swap prevents concurrent shift submissions from silently
  // overwriting one another. The API wraps this and the reading insert in one
  // database transaction; a rejected insert also rolls the value update back.
  const claimed = await client.assetMeter.updateMany({
    where: {
      id: meter.id, assetId: input.assetId, isActive: true,
      currentValue: meter.currentValue, lastReadingAt: meter.lastReadingAt,
    },
    data: { currentValue: value, lastReadingAt: readingDate },
  });
  if (claimed.count !== 1) {
    throw new Error('Meter reading conflict: a newer observation was recorded. Refresh and retry');
  }
  const reading = await client.meterReading.create({
    data: {
      readingNumber: input.readingNumber,
      assetId: input.assetId,
      assetMeterId: meter.id,
      plantId: input.plantId,
      meterName: meter.name,
      unit: meter.unit,
      value,
      readingDate,
      previousValue,
      consumption: value - previousValue,
      notes: text(input.notes) || null,
      readById: input.actorId,
    },
  });
  return reading;
}
