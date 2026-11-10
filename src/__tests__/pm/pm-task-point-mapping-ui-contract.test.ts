import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const mapper = source('src/components/modules/pm/PmInspectionTaskPointMapper.tsx');
const machine = source('src/components/modules/pm/PmMachineInspectionChecklistPanel.tsx');
const printed = source('src/components/modules/pm/PmMachineInspectionPrint.tsx');
const paper = source('src/app/api/pm-inspections/sheets/route.ts');

describe('enterprise PM explicit task/measurement flow contracts', () => {
  it('exposes a planner-only check picker that saves exact task and part associations', () => {
    expect(mapper).toContain('/api/pm-inspections/task-point-links');
    expect(mapper).toContain('componentId, pmTaskId: selectedTask, pointIds: selection');
    expect(mapper).toContain('Map ${point.name} to PM task');
    expect(machine).toContain('{canPlan && <Button');
    expect(machine).toContain('setMappingPartId(group.component.id)');
    expect(machine).toContain('<PmInspectionTaskPointMapper');
  });
  it('never silently prints a shared part with unmapped measurements', () => {
    expect(machine).toContain('missingInspectionTaskMappings(data.groups, data.explicitTaskPointLinks || [])');
    expect(machine).toContain('if (unresolved.taskCount)');
    expect(machine).toContain('taskPointLinks });');
    expect(printed).toContain('buildPaperInspectionTasks(data.groups, data.generalTasks, data.explicitTaskPointLinks || [])');
  });
  it('server verifies the mapping against stored records and snapshots the actual issue scope', () => {
    expect(paper).toContain('plannedPaperInspectionScope(validAssignments, allPoints, linkRows)');
    expect(paper).toContain('if (scoped.missingTaskMappings)');
    expect(paper).toContain('sameTaskPointPairs(verifiedPairs, requestPairs)');
    expect(paper).toContain('taskPointSnapshot: JSON.stringify(verifiedPairs)');
    expect(paper).toContain('taskPointSnapshot: i.taskPointSnapshot ? JSON.parse(i.taskPointSnapshot) : null');
  });
});
