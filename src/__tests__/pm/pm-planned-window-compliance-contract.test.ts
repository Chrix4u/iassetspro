import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM planned window and compliance UI contract',()=>{
  it('keeps planning-window and compliance behavior in the machine rollup',()=>{
    const panel=source('src/components/modules/pm/PmMachineRollupPanel.tsx');
    expect(panel).toContain('planningWindowDays');
    expect(panel).toContain('compliance');
    const view=source('src/lib/pm-compliance-view.ts');
    expect(view).toContain("return '—'");
    expect(view).toContain('completionCompliancePct');
  });
});
