import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backfillPmMeetingMigration } from '@/services/pm/pmMigration.service';

const client = {
  meterReading: { findMany: vi.fn(), updateMany: vi.fn() },
  assetMeter: { upsert: vi.fn(), findFirst: vi.fn() },
  pmScheduleTask: { findMany: vi.fn(), update: vi.fn() },
};

const reading = {
  id: 'reading-1', assetId: 'asset-1', meterName: 'Running Hours', unit: 'h', value: 3240,
  readingDate: new Date('2026-10-27T12:00:00Z'), createdAt: new Date('2026-10-27T12:00:01Z'), readById: 'tech-1',
};

const legacyTask = {
  id: 'scheduled-1', assetId: 'asset-1', maintenanceMode: 'ubm', equipmentState: 'stopped',
  meterName: 'Running Hours', frequencyUnit: 'h', assetMeterId: null,
  pmType: 'tbm', basis: 'calendar', activityMode: 'inspection',
};

describe('PM engineer-meeting migration backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.meterReading.findMany.mockResolvedValue([reading]);
    client.assetMeter.upsert.mockResolvedValue({
      id: 'meter-1', assetId: 'asset-1', name: 'Running Hours', unit: 'h', currentValue: 3240,
      lastReadingAt: reading.readingDate, isActive: true,
    });
    client.meterReading.updateMany.mockResolvedValue({ count: 1 });
    client.pmScheduleTask.findMany.mockResolvedValue([legacyTask]);
    client.pmScheduleTask.update.mockResolvedValue({ id: 'scheduled-1' });
  });

  it('reconstructs a stable asset meter from historical readings and links readings idempotently', async () => {
    const result = await backfillPmMeetingMigration(client as never);
    expect(client.assetMeter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId_name_unit: { assetId: 'asset-1', name: 'Running Hours', unit: 'h' } },
      create: expect.objectContaining({ assetId: 'asset-1', name: 'Running Hours', unit: 'h', currentValue: 3240 }),
      update: expect.objectContaining({ currentValue: 3240, lastReadingAt: reading.readingDate }),
    }));
    expect(client.meterReading.updateMany).toHaveBeenCalledWith({
      where: { assetId: 'asset-1', meterName: 'Running Hours', unit: 'h', assetMeterId: null },
      data: { assetMeterId: 'meter-1' },
    });
    expect(result.metersBackfilled).toBe(1);
  });

  it('canonicalizes legacy PM fields and links UBM task to the reconstructed meter', async () => {
    await backfillPmMeetingMigration(client as never);
    expect(client.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: expect.objectContaining({
        pmType: 'ubm', basis: 'meter', equipmentState: 'standstill', assetMeterId: 'meter-1',
      }),
    });
  });

  it('is safe to rerun because meter creation is upsert-based and links target only null legacy rows', async () => {
    await backfillPmMeetingMigration(client as never);
    await backfillPmMeetingMigration(client as never);
    expect(client.assetMeter.upsert).toHaveBeenCalledTimes(2);
    for (const call of client.meterReading.updateMany.mock.calls) {
      expect(call[0].where.assetMeterId).toBeNull();
    }
  });
});
