import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/maintenance-requests/route.ts', 'utf8');

describe('maintenance request selected plant', () => {
  it('prefers the authenticated UI plant scope when body plantId is omitted', () => {
    expect(route).toContain('const plantScope = await getPlantScope(request, session);');
    expect(route).toContain('if (plantScope.isScoped && plantScope.plantId)');
    expect(route).toContain('resolvedPlantId = plantScope.plantId;');
  });

  it('retains primary-plant fallback only after selected-scope resolution', () => {
    const scopeIndex = route.indexOf('resolvedPlantId = plantScope.plantId;');
    const fallbackIndex = route.indexOf('isPrimary: true');
    expect(scopeIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(scopeIndex);
  });
});
