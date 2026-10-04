import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const twinCollection = fs.readFileSync('src/app/api/digital-twins/route.ts', 'utf8');
const twinItem = fs.readFileSync('src/app/api/digital-twins/[id]/route.ts', 'utf8');
const sceneCollection = fs.readFileSync('src/app/api/digital-twin-scenes/route.ts', 'utf8');
const sceneItem = fs.readFileSync('src/app/api/digital-twin-scenes/[id]/route.ts', 'utf8');
const modelCollection = fs.readFileSync('src/app/api/asset-models/route.ts', 'utf8');
const modelItem = fs.readFileSync('src/app/api/asset-models/[id]/route.ts', 'utf8');

describe('digital twin plant isolation contract', () => {
  it('plant-scopes twin list, KPI, and alert reads through the linked asset', () => {
    expect(twinCollection).toContain('getPlantScope(request, session)');
    expect(twinCollection).toContain('getPlantFilterWhere(plantScope)');
    expect(twinCollection).toContain('asset: { is: assetPlantWhere }');
    expect(twinCollection).toContain('activeTwinAssets.map((t) => t.assetId)');
  });

  it('validates the target asset plant before creating a twin', () => {
    expect(twinCollection).toContain('canAccessPlantStrict(plantScope, asset.plantId)');
    expect(twinCollection).toContain("error: 'Access denied'");
  });

  it('checks plant access before direct twin reads, updates, and deletes', () => {
    expect(twinItem).toContain('getPlantScope(request, session)');
    expect(twinItem).toContain('canAccessPlantStrict(plantScope, twin.asset.plantId)');
    expect(twinItem).toContain('canAccessPlantStrict(plantScope, existing.asset.plantId)');
    expect(twinItem.match(/error: 'Access denied'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('authorizes scene list/create through the parent twin asset and prevents cross-asset model attachment', () => {
    expect(sceneCollection).toContain('getPlantScope(request, session)');
    expect(sceneCollection).toContain('canAccessPlantStrict(plantScope, twin.asset.plantId)');
    expect(sceneCollection).toContain('canAccessPlantStrict(plantScope, model.asset.plantId)');
    expect(sceneCollection).toContain('model.assetId !== twin.assetId');
    expect(sceneCollection).toContain('Asset model does not belong to the twin asset');
  });

  it('checks plant access before direct scene reads, updates, and deletes', () => {
    expect(sceneItem).toContain('getPlantScope(request, session)');
    expect(sceneItem).toContain('canAccessPlantStrict(plantScope, scene.twin.asset.plantId)');
    expect(sceneItem).toContain('canAccessPlantStrict(plantScope, existing.twin.asset.plantId)');
    expect(sceneItem).toContain('model.assetId !== existing.twin.assetId');
  });

  it('plant-scopes model list/create and direct model operations through the linked asset', () => {
    expect(modelCollection).toContain('getPlantFilterWhere(plantScope)');
    expect(modelCollection).toContain('asset: { is: assetPlantWhere }');
    expect(modelCollection).toContain('canAccessPlantStrict(plantScope, asset.plantId)');
    expect(modelItem).toContain('getPlantScope(request, session)');
    expect(modelItem).toContain('canAccessPlantStrict(plantScope, model.asset.plantId)');
    expect(modelItem).toContain('canAccessPlantStrict(plantScope, existing.asset.plantId)');
  });
});
