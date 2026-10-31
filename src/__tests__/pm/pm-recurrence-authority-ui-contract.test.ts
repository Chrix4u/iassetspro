import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM recurrence authority UI contract',()=>{
  it('uses direct task assignments as the canonical visible recurrence authority',()=>{
    const page=source('src/components/modules/pm/PmPlanningPage.tsx');
    expect(page).toContain("api.get('/api/pm-assignments?isActive=true')");
    expect(page).not.toContain('/api/pm-schedules?');
    expect(page).not.toContain('recurrenceAuthority');
  });
  it('groups canonical task assignments by target while preserving all task conditions',()=>{
    const helper=source('src/lib/pm-assignment-target-list.ts');
    expect(helper).toContain('groupPmAssignmentTargets');
    expect(helper).toContain('assignments: rows');
    expect(helper).toContain('taskCount: rows.length');
  });
  it('does not advertise direct task generation as staged or pending',()=>{
    const page=source('src/components/modules/pm/PmPlanningPage.tsx');
    expect(page.toLowerCase()).not.toContain('task-level generation is staged');
    expect(page.toLowerCase()).not.toContain('coming soon');
  });
});
