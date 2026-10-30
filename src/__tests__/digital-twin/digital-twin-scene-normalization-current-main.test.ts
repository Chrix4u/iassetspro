import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: {
    get: getMock,
  },
}));

import { useDigitalTwinStore } from '@/stores/digitalTwinStore';

const viewerSource = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');

describe('Digital Twin persisted scene normalization', () => {
  beforeEach(() => {
    getMock.mockReset();
    useDigitalTwinStore.setState({
      currentSceneId: null,
      currentScene: null,
      scenes: [],
      isLoadingScene: false,
      sceneError: null,
      modelUrl: null,
      modelLoading: false,
      modelError: null,
      cameraPreset: null,
      iotHealthMap: {},
      liveReadings: {},
    });
  });

  it('normalizes persisted relational scene records before storing them for the viewer', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        id: 'scene-1',
        name: 'Main Scene',
        description: 'Persisted scene',
        twin: { assetId: 'asset-1' },
        model: {
          filePath: '/generated-assets/models/pump.glb',
          meshBindings: [{ id: 'binding-1', meshName: 'BearingMesh', assetId: 'asset-1', componentId: 'component-bearing', asset: { name: 'Pump 01' }, component: { id: 'component-bearing', name: 'Drive-end bearing', componentCode: 'BRG-01', componentType: 'part', assetId: 'asset-1' } }],
        },
        cameraPresets: [
          {
            name: 'Front',
            position: '[1,2,3]',
            target: { x: 0, y: 1, z: 0 },
            fov: 45,
          },
        ],
        hotspots: [
          {
            id: 'hotspot-1',
            bindingId: 'binding-1',
            position: '{"x":4,"y":5,"z":6}',
            label: 'Bearing warning',
            icon: 'warning',
            isActive: true,
          },
          {
            id: 'hotspot-inactive',
            bindingId: 'binding-1',
            position: '[9,9,9]',
            label: 'Old hotspot',
            isActive: false,
          },
        ],
        annotations: [
          {
            id: 'annotation-1',
            position: '[7,8,9]',
            content: 'Check lubrication',
            author: { fullName: 'Maintenance Tech' },
            createdAt: '2026-10-19T10:00:00.000Z',
          },
        ],
      },
    });

    await useDigitalTwinStore.getState().loadScene('scene-1');

    const state = useDigitalTwinStore.getState();
    expect(state.currentScene).toEqual({
      id: 'scene-1',
      name: 'Main Scene',
      assetId: 'asset-1',
      description: 'Persisted scene',
      modelUrl: '/generated-assets/models/pump.glb',
      meshBindings: [
        {
          id: 'binding-1',
          meshName: 'BearingMesh',
          assetId: 'asset-1',
          assetName: 'Pump 01',
          componentId: 'component-bearing',
          componentName: 'Drive-end bearing',
          componentCode: 'BRG-01',
          componentType: 'part',
          isClickable: true,
          isVisible: true,
          colorOverride: undefined,
          explodeOffset: undefined,
        },
      ],
      cameraPresets: [
        {
          name: 'Front',
          position: [1, 2, 3],
          target: [0, 1, 0],
          fov: 45,
        },
      ],
      hotspots: [
        {
          id: 'hotspot-1',
          meshName: 'BearingMesh',
          position: [4, 5, 6],
          title: 'Bearing warning',
          description: undefined,
          type: 'warning',
          linkUrl: undefined,
        },
      ],
      annotations: [
        {
          id: 'annotation-1',
          meshName: undefined,
          position: [7, 8, 9],
          text: 'Check lubrication',
          author: 'Maintenance Tech',
          createdAt: '2026-10-19T10:00:00.000Z',
        },
      ],
    });
    expect(state.modelUrl).toBe('/generated-assets/models/pump.glb');
  });

  it('uses the viewer-owned canvas for screenshots', () => {
    expect(viewerSource).toContain('const canvas = canvasRef.current');
    expect(viewerSource).not.toContain("document.querySelector('canvas')");
  });
});
