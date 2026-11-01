import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('canonical direct PM assignment form contract',()=>{
  const form=source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
  const planner=source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
  it('uses the reusable task planner and serializes ordered direct assignments',()=>{
    expect(form).toContain('PmAssignmentTaskPlanner');
    expect(form).toContain('tasks.map');
    expect(form).toContain('pmAssignmentTaskPayload');
    expect(form).toContain("api.post('/api/pm-assignments'");
  });
  it('authors recurrence on each task rather than a schedule header',()=>{
    expect(form).not.toContain('formFreqType');
    expect(form).not.toContain('Schedule Description');
    expect(planner).toContain('PmAssignmentTaskCard');
  });
  it('requires at least one Task Library record',()=>{
    expect(form).toContain('tasks.length === 0');
    expect(form).toContain('add at least one Task Library task');
  });
  it('loads template starters from Task Masters',()=>{
    expect(form).toContain("api.get('/api/pm-templates?active=true')");
    expect(form).toContain('pmAssignmentDraftFromMaster');
  });
  it('loads persisted direct assignments for target edits and fixes target identity',()=>{
    expect(form).toContain('pmAssignmentDraftFromApi');
    expect(form).toContain('editTarget.assignments.map');
    expect(form).toContain('disabled={Boolean(editTarget)}');
  });
  it('updates a target atomically through the target endpoint',()=>{
    expect(form).toContain("api.patch('/api/pm-assignments/target'");
    expect(form).toContain('assignmentId');
  });
});
