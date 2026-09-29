import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/digital-twin/DigitalTwinMainPage.tsx', 'utf8');
const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');
const assetDetail = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

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
    expect(viewer).toContain('const [resolvedSceneId, setResolvedSceneId]');
    expect(viewer).toContain('const effectiveSceneId = sceneId ?? resolvedSceneId');
    expect(viewer).toContain('useDigitalTwinScene(effectiveSceneId');
    expect(viewer).toContain('setResolvedSceneId(firstScene.id)');
    expect(viewer).toContain('/api/digital-twins?assetId=');
    expect(viewer).toContain('resolvedTwinId = twinRes.success');
  });

  it('opens the selected asset twin directly from Asset Details', () => {
    expect(assetDetail).toContain('Open 3D / 2D Viewer');
    expect(assetDetail).toContain("navigate('assets-digital-twin', { twinId: twin.id, assetId: id, view: 'viewer' })");
    expect(page).toContain("pageParams?.view !== 'viewer'");
    expect(page).toContain('candidate.id === requestedTwinId');
    expect(page).toContain('candidate.asset?.id === requestedAssetId');
  });
});
