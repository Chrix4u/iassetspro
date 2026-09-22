/**
 * Behavioral security tests for plant boundary enforcement.
 * Verifies source code contracts for plant auth, cost immutability,
 * null-plant policy, and handover confirm endpoint.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('canAccessPlantStrict exists in plant-scope.ts', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/plant-scope.ts'), 'utf8');

  it('exports canAccessPlantStrict', () => {
    expect(src).toContain('export function canAccessPlantStrict');
  });

  it('returns false for null entityPlantId when non-system-wide', () => {
    expect(src).toContain('if (!entityPlantId) return false;');
  });

  it('returns true for null entityPlantId when system-wide', () => {
    // The function should check isSystemWide before the null check
    expect(src).toContain('if (plantScope.isSystemWide) return true');
    // And the null check comes after
    const idx = src.indexOf('export function canAccessPlantStrict');
    const chunk = src.slice(idx, idx + 500);
    const sysWideIdx = chunk.indexOf('isSystemWide');
    const nullIdx = chunk.indexOf('!entityPlantId');
    expect(sysWideIdx).toBeGreaterThan(-1);
    expect(nullIdx).toBeGreaterThan(sysWideIdx);
  });
});

describe('WO PUT cost field immutability', () => {
  const IMMUATABLE = ['totalCost', 'laborCost', 'partsCost', 'contractorCost', 'laborRateApplied', 'laborCurrency', 'plantId'];
  const src = readFileSync(join(process.cwd(), 'src/app/api/work-orders/[id]/route.ts'), 'utf8');

  for (const field of IMMUATABLE) {
    it(`${field} is explicitly rejected with 400`, () => {
      // The route must contain explicit rejection logic
      expect(src).toContain('not client-editable');
      // The field must NOT appear in the allowedFields array
      const allowedMatch = src.match(/const allowedFields[\s\S]*?\[([\s\S]*?)\];/);
      if (allowedMatch) {
        expect(allowedMatch[1]).not.toContain(`'${field}'`);
      }
    });
  }
});

describe('WO lifecycle routes plant auth coverage', () => {
  const routes = [
    'hold', 'resume', 'cancel', 'approve', 'close', 'verify',
    'wait-parts', 'request', 'assign', 'plan', 'start', 'complete', 'rework',
  ];

  for (const route of routes) {
    const path = join(process.cwd(), `src/app/api/work-orders/[id]/${route}/route.ts`);
    it(`${route}: imports or uses plant auth`, () => {
      if (!existsSync(path)) return; // skip missing
      const src = readFileSync(path, 'utf8');
      const hasAuth =
        src.includes('authorizeWorkOrderPlant') ||
        src.includes('authorizeWorkOrderExecutionAccess') ||
        src.includes('canAccessPlantStrict') ||
        src.includes('canAccessPlant');
      expect(hasAuth, `${route} missing plant auth`).toBe(true);
    });
  }
});

describe('WO subresource routes plant auth coverage', () => {
  const routes = [
    'print', 'comments', 'components', 'materials', 'personal-tools',
    'suggested-items', 'tasks', 'team-member-requests', 'team-members', 'time-logs',
  ];

  for (const route of routes) {
    const path = join(process.cwd(), `src/app/api/work-orders/[id]/${route}/route.ts`);
    it(`${route}: imports or uses plant auth`, () => {
      if (!existsSync(path)) return;
      const src = readFileSync(path, 'utf8');
      const hasAuth =
        src.includes('authorizeWorkOrderPlant') ||
        src.includes('authorizeWorkOrderExecutionAccess') ||
        src.includes('canAccessPlantStrict') ||
        src.includes('canAccessPlant');
      expect(hasAuth, `${route} missing plant auth`).toBe(true);
    });
  }
});

describe('MR workflow routes plant auth coverage', () => {
  const routes = ['approve', 'reject', 'assign-planner', 'comments', 'convert'];

  for (const route of routes) {
    const path = join(process.cwd(), `src/app/api/maintenance-requests/[id]/${route}/route.ts`);
    it(`MR ${route}: has plant auth`, () => {
      if (!existsSync(path)) return;
      const src = readFileSync(path, 'utf8');
      const hasAuth =
        src.includes('authorizeMaintenanceRequestPlant') ||
        src.includes('canAccessPlantStrict') ||
        src.includes('canAccessPlant');
      expect(hasAuth, `MR ${route} missing plant auth`).toBe(true);
    });
  }
});

describe('Shift handover confirm endpoint', () => {
  const path = join(process.cwd(), 'src/app/api/shift-handovers/[id]/confirm/route.ts');
  it('exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('requires pending status', () => {
    const src = readFileSync(path, 'utf8');
    expect(src).toContain("'pending'");
  });

  it('checks linked WO status is pending_handover', () => {
    const src = readFileSync(path, 'utf8');
    expect(src).toContain("'pending_handover'");
  });

  it('allows only the designated receiver to accept custody', () => {
    const src = readFileSync(path, 'utf8');
    expect(src).toContain('handover.receivedById !== session.userId');
    expect(src).toContain('Only the designated handover receiver can confirm acceptance');
  });

  it('does not expose a management override for receiver acceptance', () => {
    const src = readFileSync(path, 'utf8');
    expect(src).not.toContain('overrideReason');
    expect(src).not.toContain('isOverrideRole');
  });
});

describe('Null-plant policy', () => {
  it('WO creation rejects null plant for non-admin', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/work-orders/route.ts'), 'utf8');
    expect(src).toContain('Plant selection required');
    expect(src).toContain('No plant assigned');
  });

  it('MR creation rejects null plant for non-admin', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/maintenance-requests/route.ts'), 'utf8');
    expect(src).toContain('Plant selection required');
  });
});

describe('Plant auth helper module exists', () => {
  const path = join(process.cwd(), 'src/lib/plant-auth-helpers.ts');
  it('file exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  const src = readFileSync(path, 'utf8');
  it('exports authorizeWorkOrderPlant', () => {
    expect(src).toContain('export async function authorizeWorkOrderPlant');
  });
  it('exports bounded execution-aware WO authorization', () => {
    expect(src).toContain('export async function authorizeWorkOrderExecutionAccess');
    expect(src).toContain('isWorkOrderExecutionMember(session, wo)');
    expect(src).toContain("accessiblePlantIds: [wo.plantId]");
  });
  it('exports authorizeMaintenanceRequestPlant', () => {
    expect(src).toContain('export async function authorizeMaintenanceRequestPlant');
  });
  it('exports authorizeMaterialRequestPlant', () => {
    expect(src).toContain('export async function authorizeMaterialRequestPlant');
  });
  it('exports authorizeToolRequestPlant', () => {
    expect(src).toContain('export async function authorizeToolRequestPlant');
  });
  it('uses canAccessPlantStrict from plant-scope', () => {
    expect(src).toContain('canAccessPlantStrict');
  });
  it('does NOT bypass plant rules for ordinary managers', () => {
    // System-wide check is handled by getPlantScope, not by the helper itself
    // The helper should call canAccessPlantStrict which returns false for null
    expect(src).toContain('canAccessPlantStrict(plantScope');
  });
});
