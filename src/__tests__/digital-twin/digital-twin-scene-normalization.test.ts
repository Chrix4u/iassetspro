import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const store = fs.readFileSync('src/stores/digitalTwinStore.ts', 'utf8');
const sceneRoute = fs.readFileSync('src/app/api/digital-twin-scenes/[id]/route.ts', 'utf8');
const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');
const assetDetail = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

describe('Digital Twin scene normalization contract', () => {
  it('normalizes persisted scene records before the viewer consumes them', () => {
    expect(store).toContain('normalizeDigitalTwinScene(res.data)');
    expect(store).toContain('parseVector3(hotspot.position)');
    expect(store).toContain("hotspot.title || hotspot.label || 'Hotspot'");
    expect(store).toContain('hotspot.type || hotspot.icon');
    expect(store).toContain('meshNameByBindingId.get(hotspot.bindingId)');
  });

  it('maps persisted scene relations into viewer fields', () => {
    expect(store).toContain('raw?.twin?.assetId');
    expect(store).toContain('raw?.model?.filePath');
    expect(store).toContain('parseVector3(preset.position');
    expect(store).toContain('annotation.content || annotation.title');
  });

  it('loads the resolved twin scene so relational context reaches the viewer', () => {
    expect(viewer).toContain('await loadScene(firstScene.id)');
    expect(viewer).toContain('hotspots, annotations, camera presets, mesh bindings');
  });

  it('mounts the interactive viewer in the asset Digital Twin tab', () => {
    expect(assetDetail).toContain("import { DigitalTwinViewer }");
    expect(assetDetail).toContain('<DigitalTwinViewer');
    expect(assetDetail).toContain('twinId={twin.id}');
    expect(assetDetail).toContain('height="620px"');
    expect(assetDetail).toContain('showToolbar');
  });

  it('keeps the scene API loading the relational data required by the adapter', () => {
    expect(sceneRoute).toContain('meshBindings');
    expect(sceneRoute).toContain('hotspots:');
    expect(sceneRoute).toContain('annotations:');
    expect(sceneRoute).toContain('cameraPresets:');
  });
});
