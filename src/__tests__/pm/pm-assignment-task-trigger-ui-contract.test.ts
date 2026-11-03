import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('PM assignment task / trigger UI split', () => {
  const card = source('src/components/modules/pm/PmAssignmentTaskCard.tsx');
  const planner = source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');

  it('gives the planner and task cards explicit tasks/triggers modes', () => {
    expect(planner).toContain("mode: 'tasks' | 'triggers'");
    expect(planner).toContain('mode={mode}');
    expect(card).toContain("mode: 'tasks' | 'triggers'");
    expect(card).toContain("const triggerMode = mode === 'triggers'");
  });

  it('keeps task-library authoring and row controls on the Tasks step only', () => {
    expect(planner).toContain("mode === 'tasks'");
    expect(planner).toContain('Add Task from Library');
    expect(card).toContain('{!triggerMode &&');
    expect(card).toContain('Activity Mode');
    expect(card).toContain('Inspection Type');
    expect(card).toContain('Est. Minutes');
  });

  it('shows trigger readiness and trigger-specific controls on the Triggers step', () => {
    expect(card).toContain('validatePmAssignmentTriggerDraft');
    expect(card).toContain('Trigger Ready');
    expect(card).toContain('Trigger Setup Needed');
    expect(card).toContain('PM Type');
    expect(card).toContain('Frequency Type');
    expect(card).toContain('Next Due Date');
    expect(card).toContain('Condition Source');
  });

  it('explains that FBM is failure/event driven instead of inventing recurrence', () => {
    expect(card).toContain('Failure / event driven');
    expect(card).toContain('No recurring interval is required');
  });
});
