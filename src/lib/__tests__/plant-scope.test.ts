// ============================================================================
// Plant Scope — Type Contract & Fail-Closed Behavior Tests
// ============================================================================
//
// Tests the plant-scope module's exported types and pure functions.
// Since getPlantScope requires a NextRequest and DB access, we test
// getPlantFilterWhere, canAccessPlant, and applyPlantScope (pure functions) directly,
// and validate the PlantScopeResult type contract.
//
// We mock @/lib/db and @/lib/auth to prevent Prisma client initialization.
//
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// Mock DB and auth before importing plant-scope
vi.mock('@/lib/db', () => ({
  db: {
    userPlant: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({
  isAdmin: vi.fn((session: { roles: string[] }) => session.roles.includes('admin')),
  SessionData: {},
}));

import type { PlantScopeResult } from '../plant-scope';
import { getPlantFilterWhere, applyPlantScope, getPlantScope, canAccessPlant } from '../plant-scope';

// We need to import NextRequest for getPlantScope tests
vi.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    headers: Map<string, string>;
    constructor(init?: { headers?: Record<string, string> }) {
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    get(header: string) {
      return this.headers.get(header) ?? null;
    }
  },
}));

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

// Helper: create a valid PlantScopeResult (with all required fields)
function makeScope(overrides: Partial<PlantScopeResult>): PlantScopeResult {
  return {
    plantId: null,
    accessiblePlantIds: [],
    isScoped: false,
    isSystemWide: false,
    accessLevel: null,
    ...overrides,
  };
}

// ============================================================================
// Test 1: PlantScopeResult type contract
// ============================================================================
describe('PlantScopeResult type contract', () => {
  it('should include denyAccess as optional boolean', () => {
    const result: PlantScopeResult = makeScope({
      isScoped: false,
    });
    expect(result.denyAccess).toBeUndefined();
  });

  it('should support denyAccess: true for access denied', () => {
    const result: PlantScopeResult = makeScope({
      accessLevel: 'none',
      isScoped: true,
      denyAccess: true,
    });
    expect(result.denyAccess).toBe(true);
    expect(result.accessLevel).toBe('none');
    expect(result.isScoped).toBe(true);
    expect(result.plantId).toBeNull();
  });

  it('should support full access result', () => {
    const result: PlantScopeResult = makeScope({
      plantId: 'plant-001',
      accessLevel: 'write',
      isScoped: true,
      accessiblePlantIds: ['plant-001'],
    });
    expect(result.plantId).toBe('plant-001');
    expect(result.accessLevel).toBe('write');
    expect(result.isScoped).toBe(true);
  });

  it('should support unscoped (bypass) result', () => {
    const result: PlantScopeResult = makeScope({
      isSystemWide: true,
      isScoped: false,
    });
    expect(result.isScoped).toBe(false);
    expect(result.plantId).toBeNull();
    expect(result.isSystemWide).toBe(true);
  });

  it('should support no-header result with accessible plant IDs', () => {
    const result: PlantScopeResult = makeScope({
      isScoped: false,
      isSystemWide: false,
      accessiblePlantIds: ['plant-a', 'plant-b'],
    });
    expect(result.isScoped).toBe(false);
    expect(result.accessiblePlantIds).toEqual(['plant-a', 'plant-b']);
  });
});

// ============================================================================
// Test 2: Fail-closed behavior is documented
// ============================================================================
describe('Fail-closed behavior (documented)', () => {
  it('should deny access when denyAccess is true', () => {
    const deniedScope: PlantScopeResult = makeScope({
      accessLevel: 'none',
      isScoped: true,
      denyAccess: true,
    });
    const shouldDeny = deniedScope.denyAccess === true;
    expect(shouldDeny).toBe(true);
  });

  it('should NOT silently fall back to unscoped view when plant access denied', () => {
    const deniedScope: PlantScopeResult = makeScope({
      accessLevel: 'none',
      isScoped: true,
      denyAccess: true,
    });
    expect(deniedScope.isScoped).toBe(true);
    expect(deniedScope.denyAccess).toBe(true);
    expect(deniedScope.plantId).toBeNull();
  });
});

// ============================================================================
// Test 3: getPlantFilterWhere pure function
// ============================================================================
describe('getPlantFilterWhere', () => {
  it('should return empty object when system-wide', () => {
    const scope: PlantScopeResult = makeScope({ isSystemWide: true });
    const filter = getPlantFilterWhere(scope);
    expect(filter).toEqual({});
  });

  it('should return IN filter when not scoped but has accessible plants', () => {
    const scope: PlantScopeResult = makeScope({
      isScoped: false,
      isSystemWide: false,
      accessiblePlantIds: ['plant-a', 'plant-b'],
    });
    const filter = getPlantFilterWhere(scope);
    expect(filter).toEqual({ plantId: { in: ['plant-a', 'plant-b'] } });
  });

  it('should return sentinel when no accessible plants', () => {
    const scope: PlantScopeResult = makeScope({
      isScoped: false,
      isSystemWide: false,
      accessiblePlantIds: [],
    });
    const filter = getPlantFilterWhere(scope);
    expect(filter).toEqual({ plantId: '__ACCESS_DENIED__' });
  });

  it('should return plantId filter when scoped with plantId', () => {
    const scope: PlantScopeResult = makeScope({
      plantId: 'plant-abc',
      accessLevel: 'write',
      isScoped: true,
      accessiblePlantIds: ['plant-abc', 'plant-xyz'],
    });
    const filter = getPlantFilterWhere(scope);
    expect(filter).toEqual({ plantId: 'plant-abc' });
  });

  it('should return sentinel filter when denyAccess is true (fail-closed)', () => {
    const scope: PlantScopeResult = makeScope({
      accessLevel: 'none',
      isScoped: true,
      denyAccess: true,
    });
    const filter = getPlantFilterWhere(scope);
    expect(filter).toEqual({ plantId: '__ACCESS_DENIED__' });
  });

  it('should support custom plantIdField', () => {
    const scope: PlantScopeResult = makeScope({
      plantId: 'plant-xyz',
      accessLevel: 'admin',
      isScoped: true,
    });
    const filter = getPlantFilterWhere(scope, 'locationPlantId');
    expect(filter).toEqual({ locationPlantId: 'plant-xyz' });
  });

  it('should use custom plantIdField with denyAccess sentinel', () => {
    const scope: PlantScopeResult = makeScope({
      accessLevel: 'none',
      isScoped: true,
      denyAccess: true,
    });
    const filter = getPlantFilterWhere(scope, 'facilityPlantId');
    expect(filter).toEqual({ facilityPlantId: '__ACCESS_DENIED__' });
  });
});

// ============================================================================
// Test 4: canAccessPlant pure function
// ============================================================================
describe('canAccessPlant', () => {
  it('should return true for system-wide users', () => {
    const scope = makeScope({ isSystemWide: true });
    expect(canAccessPlant(scope, 'any-plant')).toBe(true);
  });

  it('should return true when entity has no plant', () => {
    const scope = makeScope({ accessiblePlantIds: ['plant-a'] });
    expect(canAccessPlant(scope, null)).toBe(true);
    expect(canAccessPlant(scope, undefined)).toBe(true);
  });

  it('should return false when denyAccess is true', () => {
    const scope = makeScope({ denyAccess: true });
    expect(canAccessPlant(scope, 'plant-a')).toBe(false);
  });

  it('should return true when plant is in accessible set', () => {
    const scope = makeScope({ accessiblePlantIds: ['plant-a', 'plant-b'] });
    expect(canAccessPlant(scope, 'plant-a')).toBe(true);
    expect(canAccessPlant(scope, 'plant-b')).toBe(true);
  });

  it('should return false when plant is NOT in accessible set', () => {
    const scope = makeScope({ accessiblePlantIds: ['plant-a'] });
    expect(canAccessPlant(scope, 'plant-b')).toBe(false);
  });

  it('should return true when explicitly scoped plant matches', () => {
    const scope = makeScope({
      plantId: 'plant-a',
      isScoped: true,
      accessiblePlantIds: ['plant-a', 'plant-b'],
    });
    expect(canAccessPlant(scope, 'plant-a')).toBe(true);
  });

  it('should return false when explicitly scoped plant does NOT match', () => {
    const scope = makeScope({
      plantId: 'plant-a',
      isScoped: true,
      accessiblePlantIds: ['plant-a', 'plant-b'],
    });
    expect(canAccessPlant(scope, 'plant-c')).toBe(false);
  });
});

// ============================================================================
// Test 5: applyPlantScope pure function
// ============================================================================
describe('applyPlantScope', () => {
  it('should return original where when system-wide', () => {
    const where = { status: 'active', type: 'breakdown' };
    const scope = makeScope({ isSystemWide: true });
    const result = applyPlantScope(where, scope);
    expect(result).toEqual(where);
  });

  it('should apply IN filter when not scoped but has accessible plants', () => {
    const where = { status: 'active' };
    const scope = makeScope({
      accessiblePlantIds: ['plant-a', 'plant-b'],
    });
    const result = applyPlantScope(where, scope);
    expect(result).toEqual({ status: 'active', plantId: { in: ['plant-a', 'plant-b'] } });
  });

  it('should merge plantId into existing where clause', () => {
    const where = { status: 'active' };
    const scope = makeScope({
      plantId: 'plant-001',
      accessLevel: 'write',
      isScoped: true,
      accessiblePlantIds: ['plant-001'],
    });
    const result = applyPlantScope(where, scope);
    expect(result).toEqual({ status: 'active', plantId: 'plant-001' });
  });

  it('should mutate the original where object as a fail-safe for legacy callers', () => {
    const where: Record<string, unknown> = { status: 'active' };
    const scope = makeScope({
      plantId: 'plant-001',
      isScoped: true,
      accessiblePlantIds: ['plant-001'],
    });
    const result = applyPlantScope(where, scope);
    expect(where).toEqual({ status: 'active', plantId: 'plant-001' });
    expect(result).toBe(where);
    expect(Object.keys(where)).toHaveLength(2);
  });

  it('should apply sentinel filter on denyAccess (fail-closed)', () => {
    const where = { status: 'pending' };
    const scope = makeScope({
      accessLevel: 'none',
      isScoped: true,
      denyAccess: true,
    });
    const result = applyPlantScope(where, scope);
    expect(result).toEqual({ status: 'pending', plantId: '__ACCESS_DENIED__' });
  });

  it('should use custom plantIdField in applyPlantScope', () => {
    const where = { isActive: true };
    const scope = makeScope({
      plantId: 'plant-abc',
      isScoped: true,
      accessiblePlantIds: ['plant-abc'],
    });
    const result = applyPlantScope(where, scope, 'targetPlantId');
    expect(result).toEqual({ isActive: true, targetPlantId: 'plant-abc' });
  });
});

// ============================================================================
// Test 6: getPlantScope integration (with mocked DB)
// ============================================================================
describe('getPlantScope integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should bypass scoping for admin users when no plant is selected', async () => {
    const request = new NextRequest({}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const session = { userId: 'admin-1', roles: ['admin'], permissions: [] } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await getPlantScope(request, session);
    expect(result.isScoped).toBe(false);
    expect(result.isSystemWide).toBe(true);
    expect(result.plantId).toBeNull();
  });

  it('should honor an explicitly selected plant for admin users', async () => {
    const request = new NextRequest({ headers: { 'X-Plant-ID': 'plant-selected' } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const session = { userId: 'admin-1', roles: ['admin'], permissions: [] } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await getPlantScope(request, session);
    expect(result.isScoped).toBe(true);
    expect(result.isSystemWide).toBe(false);
    expect(result.plantId).toBe('plant-selected');
    expect(result.accessiblePlantIds).toEqual(['plant-selected']);
    expect(result.accessLevel).toBe('admin');
    expect(db.userPlant.findMany).not.toHaveBeenCalled();
  });

  it('should bypass scoping for plant_manager users', async () => {
    const request = new NextRequest({}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const session = { userId: 'pm-1', roles: ['plant_manager'], permissions: [] } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await getPlantScope(request, session);
    expect(result.isScoped).toBe(false);
    expect(result.isSystemWide).toBe(true);
  });

  it('should return accessiblePlantIds when no X-Plant-ID header', async () => {
    const request = new NextRequest({}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const session = { userId: 'user-1', roles: ['planner'], permissions: [] } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    (db.userPlant.findMany as Mock).mockResolvedValue([
      { plantId: 'plant-a', accessLevel: 'write' },
      { plantId: 'plant-b', accessLevel: 'read' },
    ]);

    const result = await getPlantScope(request, session);
    expect(result.isScoped).toBe(false);
    expect(result.isSystemWide).toBe(false);
    expect(result.accessiblePlantIds).toEqual(['plant-a', 'plant-b']);
  });

  it('should return denyAccess when user has no access to requested plant', async () => {
    const request = new NextRequest({ headers: { 'X-Plant-ID': 'plant-999' } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const session = { userId: 'user-1', roles: ['planner'], permissions: [] } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    (db.userPlant.findMany as Mock).mockResolvedValue([
      { plantId: 'plant-a', accessLevel: 'write' },
    ]);

    const result = await getPlantScope(request, session);
    expect(result.isScoped).toBe(true);
    expect(result.denyAccess).toBe(true);
    expect(result.accessLevel).toBe('none');
  });

  it('should return scoped access when user has access to plant', async () => {
    const request = new NextRequest({ headers: { 'X-Plant-ID': 'plant-001' } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const session = { userId: 'user-1', roles: ['planner'], permissions: [] } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    (db.userPlant.findMany as Mock).mockResolvedValue([
      { plantId: 'plant-001', accessLevel: 'write' },
      { plantId: 'plant-002', accessLevel: 'read' },
    ]);

    const result = await getPlantScope(request, session);
    expect(result.isScoped).toBe(true);
    expect(result.plantId).toBe('plant-001');
    expect(result.accessLevel).toBe('write');
    expect(result.accessiblePlantIds).toEqual(['plant-001', 'plant-002']);
    expect(result.denyAccess).toBeUndefined();
  });
});

// ============================================================================
// Test 7: Security contract documentation
// ============================================================================
describe('Security contract (documented)', () => {
  it('should document that denyAccess check should happen before query', () => {
    const scope = makeScope({
      accessLevel: 'none',
      isScoped: true,
      denyAccess: true,
    });

    // Step 1: Check denyAccess first
    const shouldReturn403 = scope.denyAccess === true;
    expect(shouldReturn403).toBe(true);

    // Step 2: If caller ignores denyAccess, the filter still protects:
    const safetyNetFilter = getPlantFilterWhere(scope);
    expect(safetyNetFilter.plantId).toBe('__ACCESS_DENIED__');
  });

  it('should document admin/plant_manager bypass behavior', () => {
    const adminScope = makeScope({ isSystemWide: true });

    expect(adminScope.isScoped).toBe(false);
    expect(adminScope.isSystemWide).toBe(true);
    const filter = getPlantFilterWhere(adminScope);
    expect(filter).toEqual({});
  });

  it('should document canAccessPlant as preferred guard for direct-ID routes', () => {
    const scope = makeScope({
      accessiblePlantIds: ['plant-a'],
      isSystemWide: false,
    });

    // Entity in Plant A — allowed
    expect(canAccessPlant(scope, 'plant-a')).toBe(true);

    // Entity in Plant B — blocked
    expect(canAccessPlant(scope, 'plant-b')).toBe(false);

    // Entity with no plant — allowed (not plant-scoped)
    expect(canAccessPlant(scope, null)).toBe(true);
  });
});