import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('component replacement work-order traceability', () => {
  it('persists a nullable work-order relation with an indexed foreign key', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read('prisma/migrations/20260927054500_component_replacement_workorder_link/migration.sql');

    expect(schema).toContain('workOrderId     String?');
    expect(schema).toContain('workOrder  WorkOrder?');
    expect(schema).toContain('componentReplacements        ComponentReplacementHistory[]');
    expect(schema).toContain('@@index([workOrderId])');

    expect(migration).toContain('ADD COLUMN "workOrderId" TEXT');
    expect(migration).toContain('component_replacement_history_workOrderId_idx');
    expect(migration).toContain('REFERENCES "work_orders"("id")');
    expect(migration).toContain('ON DELETE SET NULL');
  });

  it('validates the linked work order and records it in the API write/audit payload', () => {
    const route = read('src/app/api/component-registry/[id]/replacements/route.ts');

    expect(route).toContain('workOrderId,');
    expect(route).toContain('const workOrder = await db.workOrder.findUnique');
    expect(route).toContain("error: 'Work order belongs to a different asset'");
    expect(route).toContain('workOrderId: workOrderId || null');
    expect(route).toContain('newValues: { componentId: id, workOrderId: workOrderId || null');
  });
});
