import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('RWOP material usage declaration accountability contract', () => {
  const route = read('src/app/api/repairs/material-requests/[id]/route.ts');
  const reconcile = read('src/app/api/repairs/material-requests/reconcile/route.ts');
  const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
  const schema = read('prisma/schema.prisma');
  const materialListRoute = read('src/app/api/repairs/material-requests/route.ts');
  const toolListRoute = read('src/app/api/repairs/tool-requests/route.ts');

  it('keeps technician declaration separate from store reconciliation', () => {
    expect(route).toContain("action === 'declare_usage'");
    expect(route).toContain("Only the assigned technician or WO team can perform");
    expect(route).toContain('declaredConsumedQty');
    expect(route).toContain('declaredWastedQty');
    expect(route).toContain('declaredReturnQty');
    expect(reconcile).toContain('isResourceStoreActor(session)');
    expect(reconcile).toContain('Only admin, store keeper, inventory manager, or tools shop attendant can reconcile material requests');
  });

  it('persists declaration provenance without treating it as a physical store return', () => {
    expect(schema).toContain('usageDeclaredById');
    expect(schema).toContain('usageDeclaredAt');
    expect(route).toContain("action: 'material_request_usage_declared'");
    expect(route).not.toContain("case 'declare_usage': {\n        const qtyToReturn");
  });

  it('lets the WO execution team see the complete scoped custody picture', () => {
    for (const source of [materialListRoute, toolListRoute]) {
      expect(source).toContain('canViewWorkOrderExecutionScope');
      expect(source).toContain('{ assignedTo: session.userId }');
      expect(source).toContain('{ teamLeaderId: session.userId }');
      expect(source).toContain('{ teamMembers: { some: { userId: session.userId } } }');
    }
  });

  it('does not make the technician completion flow call the store-only material return action', () => {
    expect(ui).not.toContain("action: 'record_return', approvedQuantity: qtyReturn, notes: 'Returned by technician on completion'");
    expect(ui).toContain("action: 'declare_usage'");
    expect(ui).toContain('Submit Usage Declaration');
    expect(ui).toContain('Verify Return & Reconcile');
    expect(ui).toContain('Transfer Tools');
  });
});
