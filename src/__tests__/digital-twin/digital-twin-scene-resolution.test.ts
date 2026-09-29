import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainPage = fs.readFileSync('src/components/digital-twin/DigitalTwinMainPage.tsx', 'utf8');

describe('digital twin scene resolution wiring', () => {
  it('passes twin and asset context into the lazy viewer so an existing scene/model can resolve', () => {
    expect(mainPage).toContain('assetId={assetId || null}');
    expect(mainPage).toContain('twinId={twinId}');
    expect(mainPage).toContain('twinName={twinName}');
  });
});