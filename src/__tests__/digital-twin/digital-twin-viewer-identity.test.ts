import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/digital-twin/DigitalTwinMainPage.tsx', 'utf8');
const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');

describe('Digital Twin full-screen scene identity propagation', () => {
  it('passes the selected asset and twin identity into the real viewer', () => {
    expect(page).toContain('assetId={assetId}');
    expect(page).toContain('twinId={twinId}');
    expect(page).toContain('twinName={twinName}');
    expect(page).not.toContain('<Component height="100%" />');
  });

  it('supports resolving a scene from either assetId or twinId', () => {
    expect(viewer).toContain('assetId?: string | null');
    expect(viewer).toContain('twinId?: string | null');
    expect(viewer).toContain('twinName?: string | null');
    expect(viewer).toContain('isResolvingScene');
  });
});
