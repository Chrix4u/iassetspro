import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/digital-twin/DigitalTwinMainPage.tsx', 'utf8');
const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');

describe('digital twin viewer context handoff', () => {
  it('passes the selected asset and twin into the real 3D viewer', () => {
    expect(page).toContain('assetId={assetId ?? null}');
    expect(page).toContain('twinId={twinId}');
    expect(page).toContain('twinName={twinName}');
  });

  it('resolves the first scene and model file from twinId', () => {
    expect(viewer).toContain('/api/digital-twin-scenes?twinId=');
    expect(viewer).toContain('firstScene.model?.filePath');
    expect(viewer).toContain('/api/asset-models/');
    expect(viewer).toContain('setResolvedModelUrl');
  });
});
