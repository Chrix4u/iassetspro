import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM meter-source discovery contract',()=>{
  it('discovers meters from the selected asset inside the PM planner',()=>{
    const planner=source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
    expect(planner).toContain("/api/assets/${encodeURIComponent(assetId)}/meters");
    expect(planner).toContain('meter.isActive !== false');
    expect(planner).not.toContain('/api/meter-readings');
  });
});
