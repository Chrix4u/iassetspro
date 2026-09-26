import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('component registry plant isolation', () => {
  it('plant-scopes component list/create access', () => {
    const route = read('src/app/api/component-registry/route.ts');
    expect(route).toContain("import { canAccessPlant, getPlantScope } from '@/lib/plant-scope'");
    expect(route).toContain('const plantScope = await getPlantScope(request, session)');
    expect(route).toContain('canAccessPlant(plantScope, asset.plantId)');
    expect(route).toContain("where.asset = { plantId: { in: plantScope.accessiblePlantIds } }");
  });

  it('plant-scopes direct component read/update/delete and target asset moves', () => {
    const route = read('src/app/api/component-registry/[id]/route.ts');
    expect(route).toContain('canAccessPlant(plantScope, component.asset?.plantId)');
    expect(route).toContain('canAccessPlant(plantScope, existing.asset?.plantId)');
    expect(route).toContain("error: 'Plant access denied for target asset'");
  });

  it('plant-scopes every component subroute', () => {
    const files = [
      'runtime',
      'spare-parts',
      'maintenance',
      'inspections',
      'health',
      'tools',
      'lubrication',
      'condition',
      'replacements',
    ];

    for (const name of files) {
      const route = read(`src/app/api/component-registry/[id]/${name}/route.ts`);
      expect(route).toContain("import { getComponentPlantAccess } from '@/lib/component-plant-access'");
      expect(route).toContain('const componentAccess = await getComponentPlantAccess(request, session, id)');
      expect(route).toContain("error: 'Plant access denied'");
    }
  });
});
