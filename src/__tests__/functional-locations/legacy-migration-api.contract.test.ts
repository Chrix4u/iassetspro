import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => {
  const full = resolve(root, path);
  expect(existsSync(full), `${path} must exist`).toBe(true);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
};

describe('legacy functional-location migration API contract', () => {
  it('exposes admin-only preview and import endpoints', () => {
    const preview = read('src/app/api/admin/functional-location-migration/preview/route.ts');
    const execute = read('src/app/api/admin/functional-location-migration/import/route.ts');
    for (const source of [preview, execute]) {
      expect(source).toContain('getSession');
      expect(source).toContain('isAdmin(session)');
      expect(source).toContain('getPlantScope');
    }
    expect(preview).toContain('previewLegacyFunctionalLocationMigration');
    expect(execute).toContain('importLegacyFunctionalLocations');
  });

  it('keeps preview and import mapping explicit and import confirmation-bound', () => {
    const execute = read('src/app/api/admin/functional-location-migration/import/route.ts');
    expect(execute).toContain("confirmation !== 'IMPORT READY LEGACY LOCATIONS'");
    expect(execute).toContain('body.mapping');
    expect(execute).toContain('previewFingerprint');
  });

  it('keeps legacy asset fields intact and records import provenance', () => {
    const service = read('src/lib/functional-location/legacy-migration-service.ts');
    expect(service).not.toMatch(/asset\.update\([\s\S]{0,300}(location|building|floor|area|departmentId)/);
    expect(service).toContain("entityType: 'functional_location_legacy_migration'");
    expect(service).toContain("reason: 'Legacy location migration'");
    expect(service).toContain('endedAt: null');
  });

  it('counts only truly absent nodes as creates and keeps incompatible existing nodes as conflicts', () => {
    const service = read('src/lib/functional-location/legacy-migration-service.ts');
    expect(service).toContain('const nodesToCreate = plan.proposedNodes.filter');
    expect(service).toContain('!existingByCode.has(node.locationCode)');
    expect(service).toContain('conflictingNodes: conflicts');
  });
});
