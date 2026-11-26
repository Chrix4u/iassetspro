import { describe, expect, it } from 'vitest';
import { createAssetMeter, normalizeAssetMeterInput, validateAssetMeterReading, recordAssetMeterReading } from '@/services/assets/assetMeter.service';
import { vi } from 'vitest';

describe('asset meter planning input', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  it('accepts an explicit first zero and a valid later cumulative observation', () => {
    expect(validateAssetMeterReading({ currentValue: 0, lastReadingAt: null }, 0, undefined, now))
      .toMatchObject({ value: 0, previousValue: 0, readingDate: now });
    expect(validateAssetMeterReading({
      currentValue: 100, lastReadingAt: new Date('2026-11-17T11:00:00Z'),
    }, 125, '2026-11-17T11:30:00Z', now)).toMatchObject({
      value: 125, previousValue: 100, readingDate: new Date('2026-11-17T11:30:00Z'),
    });
  });
  it('rejects missing, negative, decreasing, older and future cumulative readings', () => {
    const meter = { currentValue: 100, lastReadingAt: new Date('2026-11-17T11:00:00Z') };
    for (const badValue of [null, undefined, '']) {
      expect(() => validateAssetMeterReading(meter, badValue, undefined, now)).toThrow(/required/i);
    }
    expect(() => validateAssetMeterReading(meter, -1, undefined, now)).toThrow(/nonnegative/i);
    expect(() => validateAssetMeterReading(meter, 99, undefined, now)).toThrow(/cannot decrease/i);
    expect(() => validateAssetMeterReading(meter, 101, '2026-11-17T10:59:00Z', now))
      .toThrow(/later than the previous/i);
    expect(() => validateAssetMeterReading(meter, 101, '2026-11-17T12:06:00Z', now))
      .toThrow(/future/i);
  });
  it('does not insert an observation if a concurrent engineer already updated the meter', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id:'meter-1',assetId:'asset-1',isActive:true,name:'Motor Hours',
      unit:'hours',currentValue:125,lastReadingAt:new Date('2026-11-17T11:00:00Z'),
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn();
    const client = { assetMeter:{findUnique,updateMany},meterReading:{create} } as unknown as Parameters<typeof recordAssetMeterReading>[0];
    await expect(recordAssetMeterReading(client,{
      assetId:'asset-1',meterId:'meter-1',value:130,readingDate:'2026-11-17T11:30:00Z',
      actorId:'engineer-1',plantId:'plant-1',readingNumber:'MR-UAT-001',
    })).rejects.toThrow(/conflict/i);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({ id:'meter-1',currentValue:125 }),
    }));
    expect(create).not.toHaveBeenCalled();
  });

  it('normalizes a valid asset meter definition', () => {
    expect(normalizeAssetMeterInput({ name: 'Running Hours', unit: 'h', meterType: 'runtime', initialValue: 3240 })).toEqual({
      ok: true,
      value: { name: 'Running Hours', unit: 'h', meterType: 'runtime', initialValue: 3240, initialReadingProvided: true },
    });
  });

  it('distinguishes a recorded zero from unknown opening hours', () => {
    for (const missing of [undefined, null, '']) {
      expect(normalizeAssetMeterInput({ name: 'Runtime', unit: 'hours', initialValue: missing })).toMatchObject({
        ok: true, value: { initialValue: 0, initialReadingProvided: false },
      });
    }
    expect(normalizeAssetMeterInput({ name: 'Runtime', unit: 'hours', initialValue: 0 })).toMatchObject({
      ok: true, value: { initialValue: 0, initialReadingProvided: true },
    });
  });
  it('persists explicit zero and nonzero opening observations but never invents a blank reading', async () => {
    const create = vi.fn(async (request: { data: { lastReadingAt: Date | null } }) => ({id:'meter-'+request.data.lastReadingAt, ...request.data}));
    const createMany = vi.fn().mockResolvedValue({count:1});
    const client = { assetMeter: { create }, meterReading:{createMany} } as unknown as Parameters<typeof createAssetMeter>[0];
    const assetId = 'asset-1', actorId = 'engineer-1', plantId='plant-1';
    await createAssetMeter(client, { assetId, actorId, plantId, definition: { name: 'Measured Zero', unit: 'hours', initialValue: 0 } });
    expect(create.mock.calls[0][0].data.lastReadingAt).toBeInstanceOf(Date);
    expect(createMany).toHaveBeenCalledWith({data:[expect.objectContaining({assetId,plantId,assetMeterId:expect.any(String),
      meterName:'Measured Zero',unit:'hours',value:0,readingDate:create.mock.calls[0][0].data.lastReadingAt,
      previousValue:null,consumption:0,readById:actorId})]});
    await createAssetMeter(client, { assetId, actorId, plantId, definition: { name: 'Unknown Counter', unit: 'hours', initialValue: null } });
    expect(create.mock.calls[1][0].data.lastReadingAt).toBeNull();
    expect(createMany).toHaveBeenCalledTimes(1);
    await createAssetMeter(client, { assetId, actorId, plantId, definition: { name: 'Used Counter', unit: 'hours', initialValue: 120 } });
    expect(createMany).toHaveBeenLastCalledWith({data:[expect.objectContaining({value:120,consumption:0,previousValue:null})]});
  });
  it('rejects missing meter identity and non-numeric initial readings', () => {
    expect(normalizeAssetMeterInput({ name: '', unit: 'h' })).toEqual({ ok: false, error: 'Meter name is required' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: '' })).toEqual({ ok: false, error: 'Meter unit is required' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: 'cycles', initialValue: 'abc' })).toEqual({ ok: false, error: 'Initial reading must be a nonnegative number' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: 'cycles', initialValue: -1 })).toEqual({ ok: false, error: 'Initial reading must be a nonnegative number' });
  });
});
