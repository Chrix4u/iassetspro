import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const listRoute = fs.readFileSync('src/app/api/asset-models/route.ts', 'utf8');
const detailRoute = fs.readFileSync('src/app/api/asset-models/[id]/route.ts', 'utf8');
const sceneRoute = fs.readFileSync('src/app/api/digital-twin-scenes/[id]/route.ts', 'utf8');
const service = fs.readFileSync('src/services/digitalTwin.service.ts', 'utf8');

describe('digital twin asset-model binding contracts', () => {
  it('queries the current AssetModel.bindings Prisma relation while preserving the legacy count key', () => {
    expect(listRoute).toContain('_count: { select: { bindings: true } }');
    expect(listRoute).toContain('_count: { meshBindings: _count.bindings }');
    expect(listRoute).not.toContain('_count: { select: { meshBindings: true } }');
  });

  it('returns meshBindings as a compatibility alias from the detail route', () => {
    expect(detailRoute).toContain('bindings: {');
    expect(detailRoute).toContain('meshBindings: bindings');
    expect(detailRoute).not.toContain('meshBindings: {');
  });

  it('uses valid nested selects in scene loading and aliases bindings at the API edge', () => {
    expect(sceneRoute).toContain('bindings: {');
    expect(sceneRoute).toContain('meshBindings: bindings');
    expect(sceneRoute).not.toContain('meshBindings: {');
    expect(sceneRoute).not.toContain('select: { id: true, name: true, type: true, assetId: true, healthScore: true },\n          include:');
  });

  it('keeps internal services and non-null model counters aligned with the current schema', () => {
    expect(service).toContain('model: { include: { bindings: { include: { asset: true } } } }');
    expect(service).not.toContain('model: { include: { meshBindings:');
    expect(listRoute).toContain('meshCount: parseNonNegativeInt(meshCount)');
    expect(listRoute).toContain('vertexCount: parseNonNegativeInt(vertexCount)');
  });
});
