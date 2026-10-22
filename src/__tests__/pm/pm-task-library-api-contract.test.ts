import { describe, expect, it } from 'vitest'; import fs from 'node:fs'; import path from 'node:path';
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
describe('PM Task Library APIs', () => {
  it('uses plant scope and shared creation service', () => { const c=read('src/app/api/pm-tasks/route.ts'); const b=read('src/app/api/pm-tasks/bulk/route.ts'); expect(c).toContain('getPlantFilterWhere(plantScope)'); expect(c).toContain("source: 'single'"); expect(b).toContain("source: 'bulk'"); });
  it('soft deactivates', () => { const d=read('src/app/api/pm-tasks/[id]/route.ts'); expect(d).toContain('deactivatePmTask'); expect(d).not.toContain('db.pmTask.delete'); });
  it('previews imports without writes and confirms canonically', () => { const p=read('src/app/api/pm-tasks/import-preview/route.ts'); const c=read('src/app/api/pm-tasks/import-confirm/route.ts'); expect(p).not.toContain('createPmTaskBatch'); expect(c).toContain('buildPmTaskImportPreview'); expect(c).toContain("source: 'import'"); expect(c).not.toContain('row.taskNumber'); });
});
