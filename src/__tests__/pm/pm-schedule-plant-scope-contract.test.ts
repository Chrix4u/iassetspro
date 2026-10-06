import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const listAndCreate = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const direct = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM schedule plant isolation contract', () => {
  it('scopes default list queries to all plants assigned to a regular user', () => {
    expect(listAndCreate).toContain('if (!plantScope.isSystemWide)');
    expect(listAndCreate).toContain("plantId: plantScope.isScoped && plantScope.plantId");
    expect(listAndCreate).toContain('{ in: plantScope.accessiblePlantIds }');
  });

  it('fails closed when creating a PM schedule for an inaccessible asset plant', () => {
    expect(listAndCreate).toContain("import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope'");
    expect(listAndCreate).toContain('select: { id: true, plantId: true }');
    expect(listAndCreate).toContain('if (!canAccessPlantStrict(plantScope, assetExists.plantId))');
    expect(listAndCreate).toContain("{ success: false, error: 'Access denied' }, { status: 403 }");
  });

  it('plant-scopes direct GET, PUT and DELETE by the schedule asset', () => {
    expect(direct).toContain("import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope'");
    expect(direct.match(/const plantScope = await getPlantScope\(request, session\);/g)?.length).toBe(3);
    expect(direct.match(/canAccessPlantStrict\(plantScope, .*\.asset\.plantId\)/g)?.length).toBe(3);
  });
});
