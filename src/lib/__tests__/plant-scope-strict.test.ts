import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { userPlant: { findMany: vi.fn() } },
}));
vi.mock('@/lib/auth', () => ({ isAdmin: vi.fn() }));

import { canAccessPlantStrict, type PlantScopeResult } from '../plant-scope';

const scope = (overrides: Partial<PlantScopeResult>): PlantScopeResult => ({
  plantId: null,
  accessiblePlantIds: [],
  isScoped: false,
  isSystemWide: false,
  accessLevel: null,
  ...overrides,
});

describe('operational strict plant isolation', () => {
  it('requires an assigned, non-null plant for an unscoped operator', () => {
    const userScope = scope({ accessiblePlantIds: ['plant-a'] });
    expect(canAccessPlantStrict(userScope, 'plant-a')).toBe(true);
    expect(canAccessPlantStrict(userScope, 'plant-b')).toBe(false);
    expect(canAccessPlantStrict(userScope, null)).toBe(false);
  });

  it('honors the expressly selected plant even if the operator belongs to both', () => {
    const userScope = scope({
      isScoped: true, plantId: 'plant-a',
      accessiblePlantIds: ['plant-a', 'plant-b'],
      accessLevel: 'write',
    });
    expect(canAccessPlantStrict(userScope, 'plant-a')).toBe(true);
    expect(canAccessPlantStrict(userScope, 'plant-b')).toBe(false);
  });

  it('rejects denied scopes before any system-wide bypass', () => {
    expect(canAccessPlantStrict(scope({ isSystemWide: true, denyAccess: true }), 'plant-a')).toBe(false);
    expect(canAccessPlantStrict(scope({ isSystemWide: true }), 'plant-a')).toBe(true);
  });
});
