import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('canonical PM frequency model contract',()=>{
  it('offers task-level time/day and meter cadence controls',()=>{
    const card=source('src/components/modules/pm/PmAssignmentTaskCard.tsx');
    expect(card).toContain("value=\"time_day\"");
    expect(card).toContain("value=\"meter\"");
    expect(card).toContain('frequencyUnit');
    expect(card).toContain('value={task.value}');
  });
  it('discovers meter choices from the selected asset',()=>{
    const planner=source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
    expect(planner).toContain("/api/assets/${encodeURIComponent(assetId)}/meters");
    expect(planner).toContain('setMeters(meterRows)');
  });
});
