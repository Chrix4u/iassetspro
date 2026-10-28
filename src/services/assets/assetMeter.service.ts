import type { Prisma } from '@prisma/client';

type AssetMeterClient = Pick<Prisma.TransactionClient, 'assetMeter' | 'meterReading'>;

export type NormalizedAssetMeterInput = {
  name: string;
  unit: string;
  meterType: string;
  initialValue: number;
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
  const initialRaw = raw.initialValue === undefined || raw.initialValue === null || raw.initialValue === ''
    ? 0
    : Number(raw.initialValue);
  if (!Number.isFinite(initialRaw)) return { ok: false, error: 'Initial reading must be numeric' };
  return { ok: true, value: { name, unit, meterType, initialValue: initialRaw } };
}

export async function listAssetMeters(client: AssetMeterClient, assetId: string) {
  return client.assetMeter.findMany({
    where: { assetId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { unit: 'asc' }],
  });
}

export async function createAssetMeter(
  client: AssetMeterClient,
  input: { assetId: string; actorId: string; definition: unknown },
) {
  const normalized = normalizeAssetMeterInput(input.definition);
  if (!normalized.ok) throw new Error(normalized.error);
  const { name, unit, meterType, initialValue } = normalized.value;
  return client.assetMeter.create({
    data: {
      assetId: input.assetId,
      name,
      unit,
      meterType,
      currentValue: initialValue,
      lastReadingAt: initialValue !== 0 ? new Date() : null,
      createdById: input.actorId,
    },
  });
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
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error('Reading value must be numeric');
  const readingDate = input.readingDate ? new Date(String(input.readingDate)) : new Date();
  if (Number.isNaN(readingDate.getTime())) throw new Error('Reading date is invalid');
  const previousValue = Number(meter.currentValue);
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
  await client.assetMeter.update({
    where: { id: meter.id },
    data: { currentValue: value, lastReadingAt: readingDate },
  });
  return reading;
}
