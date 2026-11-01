import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('canonical PM automatic-generation UI contract',()=>{
  it('does not expose the retired legacy Auto WO schedule toggle on direct assignments',()=>{
    const form=source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    expect(form).not.toContain('Auto WO');
    expect(form).not.toContain('autoGenerateWO');
  });
  it('surfaces server automation health instead of a per-container generation switch',()=>{
    const page=source('src/components/modules/pm/PmPlanningPage.tsx');
    expect(page).toContain("api.get('/api/pm-automation/status')");
    expect(page).toContain('PM Automation');
  });
});
