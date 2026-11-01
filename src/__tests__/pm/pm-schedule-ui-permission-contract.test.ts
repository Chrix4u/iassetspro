import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM schedule UI/API permission alignment',()=>{
  it('shows create/edit/delete from schedule/work-order permissions rather than role names',()=>{
    const page=source('src/components/modules/pm/PmPlanningPage.tsx');
    expect(page).toContain("hasPermission('pm_schedules.create')");
    expect(page).toContain("hasPermission('pm_schedules.update')");
    expect(page).toContain("hasPermission('pm_schedules.delete')");
    expect(page).toContain("hasPermission('work_orders.create')");
    expect(page).toContain('canCreate');
    expect(page).toContain('canEdit');
    expect(page).toContain('canDelete');
  });
});
