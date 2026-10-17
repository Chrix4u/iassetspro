import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');
const page = fs.readFileSync('src/components/digital-twin/DigitalTwinMainPage.tsx', 'utf8');
const assetDetail = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

describe('Digital Twin scene identity handoff', () => {
  it('promotes a twin-resolved scene into the scene hook', () => {
    expect(viewer).toContain('const [resolvedSceneId, setResolvedSceneId]');
    expect(viewer).toContain('const effectiveSceneId = sceneId ?? resolvedSceneId');
    expect(viewer).toContain('useDigitalTwinScene(effectiveSceneId');
    expect(viewer).toContain('setResolvedSceneId(firstScene.id)');
    expect(viewer).toContain('loadScene(effectiveSceneId)');
  });

  it('still resolves scene context when a model URL override is supplied', () => {
    expect(viewer).not.toContain('if (sceneId || !twinId || propModelUrl)');
    expect(viewer).toContain('if (propModelUrl)');
    expect(viewer).toContain('setResolvedSceneId(firstScene.id)');
  });

  it('hands the known twin identity from Asset Details into full-screen viewer mode', () => {
    expect(assetDetail).toContain("navigate('assets-digital-twin', { twinId: twin.id, assetId: id, view: 'viewer' })");
    expect(assetDetail).toContain('Open 3D / 2D Viewer');
    expect(page).toContain('useNavigationStore');
    expect(page).toContain("pageParams?.view !== 'viewer'");
    expect(page).toContain('candidate.id === requestedTwinId');
    expect(page).toContain("setViewMode('viewer')");
  });
});
