import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const modulePath = resolve(process.cwd(), 'src/lib/functional-location/location-code.ts');

async function loadLocationCodeModule() {
  expect(existsSync(modulePath), 'Location Code domain module must exist').toBe(true);
  if (!existsSync(modulePath)) return null;
  return import(pathToFileURL(modulePath).href);
}

describe('functional location Location Code contract', () => {
  it('normalizes codes to trimmed uppercase without silently accepting whitespace', async () => {
    const mod = await loadLocationCodeModule();
    if (!mod) return;

    expect(mod.normalizeLocationCode('  tema-prt_01  ')).toBe('TEMA-PRT_01');
    expect(() => mod.normalizeLocationCode('TEMA PRT')).toThrow(/character|format|code/i);
  });

  it('validates configurable non-alphanumeric separators', async () => {
    const mod = await loadLocationCodeModule();
    if (!mod) return;

    expect(mod.validateCodeSeparator('-')).toBe('-');
    expect(mod.validateCodeSeparator('/')).toBe('/');
    expect(mod.validateCodeSeparator(':')).toBe(':');
    expect(mod.validateCodeSeparator('_')).toBe('_');
    expect(mod.validateCodeSeparator('.')).toBe('.');
    expect(() => mod.validateCodeSeparator('#')).toThrow(/separator|supported/i);
    expect(() => mod.validateCodeSeparator('A')).toThrow(/separator/i);
    expect(() => mod.validateCodeSeparator(' ')).toThrow(/separator/i);
  });

  it('builds manual codes from the authorized full-code input', async () => {
    const mod = await loadLocationCodeModule();
    if (!mod) return;

    expect(mod.buildLocationCode({
      mode: 'manual',
      separator: '-',
      manualCode: ' tema-prt-l01 ',
      allowOverride: true,
    })).toBe('TEMA-PRT-L01');
  });

  it('builds generated child and root codes from prefix plus segment', async () => {
    const mod = await loadLocationCodeModule();
    if (!mod) return;

    expect(mod.buildLocationCode({
      mode: 'generated',
      separator: '-',
      parentCode: 'TEMA-PRT',
      prefix: 'L',
      segment: '01',
      allowOverride: false,
    })).toBe('TEMA-PRT-L01');

    expect(mod.buildLocationCode({
      mode: 'generated',
      separator: '-',
      prefix: 'PLT',
      segment: '1',
      allowOverride: false,
    })).toBe('PLT1');
  });

  it('uses mixed-mode override only when overrides are authorized', async () => {
    const mod = await loadLocationCodeModule();
    if (!mod) return;

    const base = {
      mode: 'mixed' as const,
      separator: '-',
      parentCode: 'TEMA',
      prefix: 'P',
      segment: '03',
      manualCode: 'custom_03',
    };

    expect(mod.buildLocationCode({ ...base, allowOverride: true })).toBe('CUSTOM_03');
    expect(mod.buildLocationCode({ ...base, allowOverride: false })).toBe('TEMA-P03');
  });

  it('rejects generated codes without a segment', async () => {
    const mod = await loadLocationCodeModule();
    if (!mod) return;

    expect(() => mod.buildLocationCode({
      mode: 'generated',
      separator: '-',
      prefix: 'L',
      allowOverride: false,
    })).toThrow(/segment/i);
  });
});
