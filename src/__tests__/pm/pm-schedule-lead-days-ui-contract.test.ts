import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM lead-days form contract',()=>{
  it('preserves explicit zero lead days when loading an assignment for edit',()=>{
    const draft=source('src/lib/pm-assignment-draft.ts');
    expect(draft).toContain("leadDays: String(assignment.leadDays ?? 0)");
  });
  it('serializes zero rather than replacing it with a default',()=>{
    const draft=source('src/lib/pm-assignment-draft.ts');
    expect(draft).toContain('leadDays: subDay ? 0 : wholeOrZero(task.leadDays)');
    expect(draft).not.toContain('Number(task.leadDays) || 3');
  });
});
