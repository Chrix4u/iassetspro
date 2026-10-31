import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM automation operator status contract',()=>{
  it('surfaces automation health on canonical PM Planning without mutating schedules',()=>{
    const page=source('src/components/modules/pm/PmPlanningPage.tsx');
    expect(page).toContain("api.get('/api/pm-automation/status')");
    expect(page).toContain('PM Automation');
    expect(page).not.toMatch(/api\.(post|put|patch|delete)\('\/api\/pm-automation\/status/);
  });
});
