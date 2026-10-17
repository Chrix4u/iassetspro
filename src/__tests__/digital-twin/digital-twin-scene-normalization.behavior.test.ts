import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: getMock },
}));

import { useDigitalTwinStore } from '@/stores/digitalTwinStore';

describe('Digital Twin persisted scene normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDigitalTwinStore.getState().reset();
  });

  it('normalizes persisted nested scene relations and JSON vectors before storing them', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        id: 'scene-1',
        name: 'Line 1 scene',
        twin: { assetId: 'asset-1' },
        model: {
          id: 'model-1',
          filePath: '/models/line-1.glb',
          meshBindings: [{ id: 'binding-1', meshName: 'PumpMesh' }],
        },
        cameraPresets: [
          { name: 'Front', position: '{"x":1,"y":2,"z":3}', target: '[4,5,6]', fov: 45 },
        ],
        hotspots: [
          {
            id: 'hot-1',
            bindingId: 'binding-1',
            position: '{"x":7,"y":8,"z":9}',
            label: 'Seal risk',
            description: 'Inspect seal',
            icon: 'danger',
            isActive: true,
          },
        ],
        annotations: [
          {
            id: 'ann-1',
            position: '{"x":2,"y":3,"z":4}',
            title: 'Bearing note',
            content: 'Inspect bearing',
            author: { fullName: 'Planner One' },
            createdAt: '2026-10-17T12:00:00.000Z',
          },
        ],
      },
    });

    await useDigitalTwinStore.getState().loadScene('scene-1');

    const state = useDigitalTwinStore.getState();
    expect(state.modelUrl).toBe('/models/line-1.glb');
    expect(state.currentScene).toMatchObject({
      id: 'scene-1',
      assetId: 'asset-1',
      modelId: 'model-1',
      modelUrl: '/models/line-1.glb',
      cameraPresets: [{ name: 'Front', position: [1, 2, 3], target: [4, 5, 6], fov: 45 }],
      hotspots: [{
        id: 'hot-1',
        meshName: 'PumpMesh',
        position: [7, 8, 9],
        title: 'Seal risk',
        type: 'critical',
      }],
      annotations: [{
        id: 'ann-1',
        position: [2, 3, 4],
        text: 'Inspect bearing',
        author: 'Planner One',
      }],
    });
  });

  it('fails safe on malformed vectors and excludes inactive hotspots', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        id: 'scene-2',
        name: 'Fallback scene',
        twin: { assetId: 'asset-2' },
        model: { filePath: '/models/fallback.glb', meshBindings: [] },
        cameraPresets: [{ name: 'Bad preset', position: 'not-json', target: null }],
        hotspots: [
          { id: 'inactive', position: 'not-json', label: 'Hidden', icon: 'info', isActive: false },
        ],
        annotations: [{ id: 'ann-2', position: 'not-json', title: 'Fallback annotation', content: '' }],
      },
    });

    await useDigitalTwinStore.getState().loadScene('scene-2');

    const scene = useDigitalTwinStore.getState().currentScene;
    expect(scene?.cameraPresets?.[0]).toMatchObject({ position: [5, 5, 5], target: [0, 0, 0] });
    expect(scene?.hotspots).toEqual([]);
    expect(scene?.annotations?.[0]?.position).toEqual([0, 0, 0]);
  });
});
