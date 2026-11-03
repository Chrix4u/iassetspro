import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const form = source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
const planner = source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
const list = source('src/components/modules/pm/PmAssignmentTargetList.tsx');
const page = source('src/components/modules/pm/PmPlanningPage.tsx');

describe('PM direct assignment task trigger workflow', () => {
  it('makes Tasks -> Triggers an explicit two-step authoring flow', () => {
    expect(form).toContain("type PmAssignmentAuthoringStep = 'tasks' | 'triggers'");
    expect(form).toContain('Continue to Triggers');
    expect(form).toContain('Back to Tasks');
    expect(form).toContain('1. Tasks');
    expect(form).toContain('2. Triggers');
  });

  it('keeps task selection separate from per-task trigger configuration', () => {
    expect(planner).toContain("stage?: 'tasks' | 'triggers'");
    expect(planner).toContain("stage === 'tasks'");
    expect(planner).toContain('pm-assignment-task-planning-grid');
    expect(planner).toContain('pm-assignment-condition-planning-grid');
    expect(planner).toContain("stage === 'triggers'");
  });

  it('lets planners reopen a target directly in trigger configuration', () => {
    expect(list).toContain('onConfigureTriggers');
    expect(list).toContain('Configure Triggers');
    expect(page).toContain('triggerTarget');
    expect(page).toContain("initialStep={triggerTarget ? 'triggers' : 'tasks'}");
  });

  it('continues using direct assignment APIs instead of schedule-level trigger records', () => {
    expect(form).toContain('/api/pm-assignments');
    expect(form).not.toContain('/api/pm-triggers');
  });
});
