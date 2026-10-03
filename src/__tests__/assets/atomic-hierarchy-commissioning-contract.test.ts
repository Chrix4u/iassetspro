import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('atomic hierarchy commissioning contract', () => {
  const panel = fs.readFileSync('src/components/assets/HierarchyCommissioningPanel.tsx', 'utf8');
  const route = fs.readFileSync('src/app/api/component-registry/bulk/route.ts', 'utf8');

  it('submits the whole hierarchy in one bulk request', () => {
    expect(panel).toContain("api.post<any>('/api/component-registry/bulk'");
    expect(panel).not.toContain("api.post<any>('/api/component-registry',");
    expect(panel).toContain('committed atomically on the server');
  });

  it('enforces permission, plant ownership and a bounded batch server-side', () => {
    expect(route).toContain('canCreateComponentHierarchy(session)');
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlant(plantScope, asset.plantId)');
    expect(route).toContain('incomingRows.length < 1 || incomingRows.length > 100');
  });

  it('resolves parent codes and commits components plus audits in one transaction', () => {
    expect(route).toContain('ordered = orderRows(rows, new Set(existingParentMap.keys()))');
    expect(route).toContain('const created = await db.$transaction(async (tx) =>');
    expect(route).toContain('await tx.componentRegistry.create');
    expect(route).toContain('await tx.auditLog.create');
    expect(route).toContain("source: 'frontend_hierarchy_bulk'");
  });

  it('rejects duplicates, unresolved parents and cycles before committing', () => {
    expect(route).toContain('Duplicate componentCode in batch');
    expect(route).toContain('Component code already exists');
    expect(route).toContain('Parent component not found on this asset');
    expect(route).toContain('Hierarchy contains a circular or unresolved parent relationship');
  });
});
