import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM responsive assignment form contract',()=>{
  it('uses a compact responsive task grid rather than full-width stacked desktop fields',()=>{
    const card=source('src/components/modules/pm/PmAssignmentTaskCard.tsx');
    expect(card).toContain('grid-cols-12');
    expect(card).toContain('lg:grid-cols-4');
    expect(card).toContain('xl:grid-cols-[');
  });
  it('keeps task-level planning primary with no legacy schedule-header recurrence editor',()=>{
    const form=source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    expect(form).toContain('PmAssignmentTaskPlanner');
    expect(form).not.toContain('formFreqType');
    expect(form).not.toContain('Legacy PM');
  });
  it('uses full-width mobile actions that return to compact buttons on larger screens',()=>{
    const form=source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    expect(form).toContain('w-full sm:w-auto');
  });
});
