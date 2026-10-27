import { describe, expect, it } from 'vitest';
import { normalizeAssetMeterInput } from '@/services/assets/assetMeter.service';

describe('asset meter planning input', () => {
  it('normalizes a valid asset meter definition', () => {
    expect(normalizeAssetMeterInput({ name: 'Running Hours', unit: 'h', meterType: 'runtime', initialValue: 3240 })).toEqual({
      ok: true,
      value: { name: 'Running Hours', unit: 'h', meterType: 'runtime', initialValue: 3240 },
    });
  });

  it('rejects missing meter identity and non-numeric initial readings', () => {
    expect(normalizeAssetMeterInput({ name: '', unit: 'h' })).toEqual({ ok: false, error: 'Meter name is required' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: '' })).toEqual({ ok: false, error: 'Meter unit is required' });
    expect(normalizeAssetMeterInput({ name: 'Cycles', unit: 'cycles', initialValue: 'abc' })).toEqual({ ok: false, error: 'Initial reading must be numeric' });
  });
});
