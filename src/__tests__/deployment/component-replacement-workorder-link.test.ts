import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('component replacement work-order traceability', () => {
  it('persists a nullable indexed work-order relation', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read('prisma/migrations/20261005231500_component_replacement_workorder_link/migration.sql');
    expect(schema).toContain('componentReplacements        ComponentReplacementHistory[]');
    expect(schema).toContain('workOrderId     String?');
    expect(schema).toContain('workOrder  WorkOrder?');
    expect(schema).toContain('@@index([workOrderId])');
    expect(migration).toContain('ADD COLUMN "workOrderId" TEXT');
    expect(migration).toContain('REFERENCES "work_orders"("id")');
    expect(migration).toContain('ON DELETE SET NULL');
  });

  it('enforces plant scope and same-asset work-order linkage in the API', () => {
    const route = read('src/app/api/component-registry/[id]/replacements/route.ts');
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlant(plantScope, component.asset?.plantId)');
    expect(route).toContain('const workOrder = await db.workOrder.findUnique');
    expect(route).toContain("error: 'Work order belongs to a different asset'");
    expect(route).toContain('workOrderId: workOrderId ? String(workOrderId) : null');
    expect(route).toContain("workOrder: { select: { id: true, woNumber: true, title: true, status: true } }");
  });

  it('shows the linked work order in replacement history', () => {
    const page = read('src/components/modules/AssetDetailPage.tsx');
    expect(page).toContain('<TableHead>Work Order</TableHead>');
    expect(page).toContain("record.workOrder?.woNumber || '—'");
  });
});
