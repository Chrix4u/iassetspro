import type { MeshHealthEntry } from '@/stores/digitalTwinStore';

export interface IoTReadingUpdatePayload {
  deviceId: string;
  assetId?: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface IoTHealthUpdatePayload {
  assetId?: string;
  healthMap: Record<string, MeshHealthEntry>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseIoTReadingUpdate(value: unknown): IoTReadingUpdatePayload | null {
  const record = asRecord(value);
  if (!record) return null;

  const deviceId = typeof record.deviceId === 'string' ? record.deviceId.trim() : '';
  const unit = typeof record.unit === 'string' ? record.unit : '';
  const timestamp = typeof record.timestamp === 'string' ? record.timestamp.trim() : '';
  const numericValue = typeof record.value === 'number' ? record.value : Number.NaN;
  if (!deviceId || !timestamp || !Number.isFinite(numericValue)) return null;

  const assetId = typeof record.assetId === 'string' && record.assetId.trim()
    ? record.assetId.trim()
    : undefined;

  return { deviceId, assetId, value: numericValue, unit, timestamp };
}

export function parseIoTHealthUpdate(value: unknown): IoTHealthUpdatePayload | null {
  const record = asRecord(value);
  const healthMapRecord = asRecord(record?.healthMap);
  if (!record || !healthMapRecord) return null;

  const healthMap: Record<string, MeshHealthEntry> = {};
  const allowedStatuses = new Set<MeshHealthEntry['status']>(['healthy', 'warning', 'critical', 'unknown']);

  for (const [meshKey, rawEntry] of Object.entries(healthMapRecord)) {
    const entry = asRecord(rawEntry);
    const score = typeof entry?.score === 'number' ? entry.score : Number.NaN;
    const status = entry?.status;
    if (!entry || !Number.isFinite(score) || typeof status !== 'string' || !allowedStatuses.has(status as MeshHealthEntry['status'])) {
      return null;
    }
    healthMap[meshKey] = { score, status: status as MeshHealthEntry['status'] };
  }

  const assetId = typeof record.assetId === 'string' && record.assetId.trim()
    ? record.assetId.trim()
    : undefined;

  return { assetId, healthMap };
}
