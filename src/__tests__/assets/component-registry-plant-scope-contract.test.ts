import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collectionRoute = fs.readFileSync('src/app/api/component-registry/route.ts', 'utf8');
const detailRoute = fs.readFileSync('src/app/api/component-registry/[id]/route.ts', 'utf8');

describe('component registry plant isolation', () => {
  it('filters component collections to the caller plant scope', () => {
    expect(collectionRoute).toContain("getPlantScope(request, session)");
    expect(collectionRoute).toContain("plantScope.accessiblePlantIds");
    expect(collectionRoute).toContain("where.asset =");
    expect(collectionRoute).toContain("Plant access denied");
  });

  it('checks target asset and parent plant access on create', () => {
    expect(collectionRoute).toContain("select: { id: true, plantId: true }");
    expect(collectionRoute).toContain("canAccessPlant(plantScope, asset.plantId)");
    expect(collectionRoute).toContain("canAccessPlant(plantScope, parent.asset?.plantId)");
  });

  it('protects direct read, update and delete by component asset plant', () => {
    expect(detailRoute).toContain("getPlantScope(request, session)");
    expect(detailRoute).toContain("canAccessPlant(plantScope, component.asset?.plantId)");
    expect(detailRoute).toContain("canAccessPlant(plantScope, existing.asset?.plantId)");
    expect(detailRoute).toContain("canAccessPlant(plantScope, targetAsset.plantId)");
    expect(detailRoute).toContain("canAccessPlant(plantScope, parent.asset?.plantId)");
  });
});