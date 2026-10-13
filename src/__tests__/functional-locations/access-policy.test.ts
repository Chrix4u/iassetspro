import { describe, expect, it } from 'vitest';
import {
  getFunctionalLocationPlantWhere,
  canMutateFunctionalLocationForScope,
} from '@/lib/functional-location/access';
import type { PlantScopeResult } from '@/lib/plant-scope';

const scope = (overrides: Partial<PlantScopeResult> = {}): PlantScopeResult => ({
  plantId: null,
  accessiblePlantIds: [],
  isScoped: false,
  isSystemWide: false,
  accessLevel: null,
  ...overrides,
});

describe('functional location plant access policy', () => {
  it('never turns an unassigned regular user into an unrestricted list query', () => {
    expect(getFunctionalLocationPlantWhere(scope())).toEqual({ plantId: null });
  });

  it('shows global ancestors plus accessible plant nodes for regular users', () => {
    expect(getFunctionalLocationPlantWhere(scope({ accessiblePlantIds: ['p1', 'p2'] }))).toEqual({
      OR: [{ plantId: null }, { plantId: { in: ['p1', 'p2'] } }],
    });
  });

  it('shows global ancestors plus the explicitly selected plant', () => {
    expect(getFunctionalLocationPlantWhere(scope({
      plantId: 'p2',
      accessiblePlantIds: ['p1', 'p2'],
      isScoped: true,
      accessLevel: 'write',
    }))).toEqual({ OR: [{ plantId: null }, { plantId: 'p2' }] });
  });

  it('leaves system-wide list access unrestricted', () => {
    expect(getFunctionalLocationPlantWhere(scope({ isSystemWide: true }))).toEqual({});
  });

  it('permits global mutations only for system-wide context', () => {
    expect(canMutateFunctionalLocationForScope(scope(), null)).toBe(false);
    expect(canMutateFunctionalLocationForScope(scope({ isSystemWide: true }), null)).toBe(true);
    expect(canMutateFunctionalLocationForScope(scope({ accessiblePlantIds: ['p1'] }), 'p1')).toBe(true);
    expect(canMutateFunctionalLocationForScope(scope({ accessiblePlantIds: ['p1'] }), 'p2')).toBe(false);
  });
});
