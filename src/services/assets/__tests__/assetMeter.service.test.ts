import { describe, expect, it } from 'vitest';
import { createAssetMeter, normalizeAssetMeterInput } from '@/services/assets/assetMeter.service';
import { vi } from 'vitest';

describe('asset meter planning input', () => {
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
  it('persists a timestamp for an observed zero, not a blank counter', async () => {
    const create = vi.fn(async (request: { data: { lastReadingAt: Date | null } }) => request.data);
    const client = { assetMeter: { create } } as unknown as Parameters<typeof createAssetMeter>[0];
    const assetId = 'asset-1', actorId = 'engineer-1';
    await createAssetMeter(client, { assetId, actorId, definition: { name: 'Measured Zero', unit: 'hours', initialValue: 0 } });
    expect(create.mock.calls[0][0].data.lastReadingAt).toBeInstanceOf(Date);
    await createAssetMeter(client, { assetId, actorId, definition: { name: 'Unknown Counter', unit: 'hours', initialValue: null } });
    expect(create.mock.calls[1][0].data.lastReadingAt).toBeNull();
  });
  it('rejects missing meter identity and non-numeric initial readings', () => {
    expect(normalizeAssetMeterInput({ name: '', unit: 'h' })).toEqual({ ok: false, error: 'Meter name is required' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: '' })).toEqual({ ok: false, error: 'Meter unit is required' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: 'cycles', initialValue: 'abc' })).toEqual({ ok: false, error: 'Initial reading must be a nonnegative number' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: 'cycles', initialValue: -1 })).toEqual({ ok: false, error: 'Initial reading must be a nonnegative number' });
  });
});
