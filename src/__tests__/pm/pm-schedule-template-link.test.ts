import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM template starter linkage',()=>{
  it('loads active templates as Task Library starters for canonical direct PM assignments',()=>{
    const form=source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    expect(form).toContain("api.get('/api/pm-templates?active=true')");
    expect(form).toContain('PmAssignmentTaskPlanner');
    expect(form).toContain('setTasks(rows)');
    expect(form).toContain("api.post('/api/pm-assignments'");
    expect(form).not.toContain("api.post('/api/pm-schedules'");
  });
});
