import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import path from 'node:path';
const root = process.cwd(); const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
describe('PM Task Library schema/RBAC', () => {
  it('defines plant-scoped stable task numbers', () => { const s = read('prisma/schema.prisma'); expect(s).toContain('model PmTask {'); expect(s).toContain('@@unique([plantId, taskNumber])'); expect(s).toContain('@@index([plantId, taskType, isActive])'); expect(s).toContain('@@map("pm_tasks")'); });
  it('keeps permission catalogs synchronized', () => { for (const rel of ['prisma/seed-permissions-only.ts','prisma/seed.ts','prisma/seed-all.ts','prisma/seed-missing.ts']) expect(read(rel)).toContain("pm_tasks: ['view', 'create', 'update', 'delete', 'import']"); });
  it('mirrors task permissions into runtime sync', () => { const s = read('src/app/api/admin/sync-permissions/route.ts'); for (const p of ['pm_tasks.view','pm_tasks.create','pm_tasks.update','pm_tasks.delete','pm_tasks.import']) expect(s).toContain(`'${p}'`); });
});
