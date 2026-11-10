import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const route = source('src/app/api/pm-inspections/task-point-links/route.ts');
const checklist = source('src/app/api/pm-inspections/checklist/route.ts');
const migration = source('prisma/migrations/20261110111500_pm_explicit_task_inspection_points/migration.sql');

describe('explicit PM task/checkpoint mapping contract', () => {
  it('restricts all reads and writes to an authorized plant and registered machine part', () => {
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlantStrict(scope, part.asset.plantId)');
    expect(route).toContain("part.assetId !== part.asset.id");
    expect(route).toContain("hasPermission(s, 'pm_schedules.update')");
    expect(route).toContain("activityMode: 'inspection'");
    expect(route).toContain("pmTask: { is: { isActive: true, plantId } }");
  });
  it('rejects cross-part forged point references and limits changes to one task and one part', () => {
    expect(route).toContain('validateInspectionTaskPointSelection(body.pointIds');
    expect(route).toContain('tasks.some((t) => t.pmTaskId === pmTaskId)');
    expect(route).toContain('where: { pmTaskId, inspectionPoint: { componentId } }');
    expect(route).toContain("entityType: 'pm_inspection_task_point_mapping'");
    expect(route).toContain('db.$transaction(async (tx)');
  });
  it('returns only already plant-scoped associations from the machine checklist API', () => {
    expect(checklist).toContain('explicitTaskPointLinks');
    expect(checklist).toContain('inspectionPointId: { in: items.map((point) => point.id) }');
  });
  it('uses additive SQL and retains historical part inspection records', () => {
    expect(migration).toContain('CREATE TABLE "pm_inspection_task_points"');
    expect(migration).toContain('PRIMARY KEY ("pmTaskId","inspectionPointId")');
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});
