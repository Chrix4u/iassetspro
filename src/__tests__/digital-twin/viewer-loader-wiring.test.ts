import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/digital-twin/DigitalTwinMainPage.tsx', 'utf8');

describe('digital twin viewer wiring', () => {
  it('passes selected twin identity into the real viewer so it can resolve the default scene/model', () => {
    expect(page).toContain('<Component height="100%" assetId={assetId} twinId={twinId} twinName={twinName} />');
  });

  it('normalizes authenticated generated-model API aliases to public GLB URLs', () => {
    const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');
    expect(viewer).toContain("/^\\/api\\/generated-assets\\/models\\//");
    expect(viewer).toContain("'/generated-assets/models/'");
  });
});