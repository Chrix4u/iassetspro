import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('PM task-list workflow contract',()=>{
  it('keeps PM authoring focused on target tasks rather than work-order assignment',()=>{
    const form=source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    expect(form).toContain('PmAssignmentTaskPlanner');
    expect(form).not.toContain('assignedToId');
    expect(form).not.toContain('teamLeaderId');
  });
  it('shows every saved task and its conditions in the target View modal',()=>{
    const detail=source('src/components/modules/pm/PmAssignmentTargetDetailDialog.tsx');
    expect(detail).toContain('group.assignments.map');
    expect(detail).toContain('Task #');
    expect(detail).toContain('Estimated Minutes');
    expect(detail).toContain('Condition Source');
  });
  it('summarizes each target with task count and estimated time',()=>{
    const list=source('src/components/modules/pm/PmAssignmentTargetList.tsx');
    expect(list).toContain('group.taskCount');
    expect(list).toContain('group.totalEstimatedMinutes');
  });
  it('uses permanent Task Masters with ordering controls in the planner',()=>{
    const planner=source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
    expect(planner).toContain('PmScheduleTaskPickerDialog');
    expect(planner).toContain('move');
    expect(planner).toContain('pmAssignmentDraftFromMaster');
  });
});
