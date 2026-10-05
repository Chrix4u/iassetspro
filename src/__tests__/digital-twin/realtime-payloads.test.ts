import { describe, expect, it } from 'vitest';
import { parseIoTHealthUpdate, parseIoTReadingUpdate } from '@/hooks/useDigitalTwin/digital-twin-realtime-payloads';

describe('Digital Twin real-time payload parsing', () => {
  it('accepts a valid IoT reading and normalizes optional asset IDs', () => {
    expect(parseIoTReadingUpdate({
      deviceId: 'sensor-1', assetId: ' asset-1 ', value: 42.5, unit: 'C', timestamp: '2026-10-05T09:00:00Z',
    })).toEqual({
      deviceId: 'sensor-1', assetId: 'asset-1', value: 42.5, unit: 'C', timestamp: '2026-10-05T09:00:00Z',
    });
  });

  it('rejects malformed IoT readings', () => {
    expect(parseIoTReadingUpdate(null)).toBeNull();
    expect(parseIoTReadingUpdate({ deviceId: '', value: 1, unit: 'C', timestamp: 'now' })).toBeNull();
    expect(parseIoTReadingUpdate({ deviceId: 'sensor-1', value: 'bad', unit: 'C', timestamp: 'now' })).toBeNull();
  });

  it('accepts a valid health map and rejects invalid entries', () => {
    expect(parseIoTHealthUpdate({
      assetId: 'asset-1',
      healthMap: { motor: { score: 91, status: 'healthy' }, bearing: { score: 45, status: 'warning' } },
    })).toEqual({
      assetId: 'asset-1',
      healthMap: { motor: { score: 91, status: 'healthy' }, bearing: { score: 45, status: 'warning' } },
    });
    expect(parseIoTHealthUpdate({ healthMap: { motor: { score: 'bad', status: 'healthy' } } })).toBeNull();
    expect(parseIoTHealthUpdate({ healthMap: { motor: { score: 90, status: 'invalid' } } })).toBeNull();
  });
});
