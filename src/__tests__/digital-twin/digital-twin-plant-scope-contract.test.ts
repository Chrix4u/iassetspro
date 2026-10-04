import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collectionRoute = fs.readFileSync('src/app/api/digital-twins/route.ts', 'utf8');
const itemRoute = fs.readFileSync('src/app/api/digital-twins/[id]/route.ts', 'utf8');

describe('digital twin plant isolation contract', () => {
  it('plant-scopes list, KPI, and alert reads through the linked asset', () => {
    expect(collectionRoute).toContain('getPlantScope(request, session)');
    expect(collectionRoute).toContain('getPlantFilterWhere(plantScope)');
    expect(collectionRoute).toContain('asset: { is: assetPlantWhere }');
    expect(collectionRoute).toContain('activeTwinAssets.map((t) => t.assetId)');
  });

  it('validates the target asset plant before creating a twin', () => {
    expect(collectionRoute).toContain('canAccessPlantStrict(plantScope, asset.plantId)');
    expect(collectionRoute).toContain("error: 'Access denied'");
  });

  it('checks plant access before direct twin reads, updates, and deletes', () => {
    expect(itemRoute).toContain('getPlantScope(request, session)');
    expect(itemRoute).toContain('canAccessPlantStrict(plantScope, twin.asset.plantId)');
    expect(itemRoute).toContain('canAccessPlantStrict(plantScope, existing.asset.plantId)');
    expect(itemRoute.match(/error: 'Access denied'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
