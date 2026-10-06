import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const due = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
const meter = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');
const signal = fs.readFileSync('src/services/pm/conditionProductionTriggerEngine.ts', 'utf8');
const helper = fs.readFileSync('src/services/pm/materializePmTemplateTasks.service.ts', 'utf8');
const readiness = fs.readFileSync('src/services/workOrderReadiness.service.ts', 'utf8');
const taskList = fs.readFileSync('src/app/api/work-orders/[id]/tasks/route.ts', 'utf8');
const taskPatch = fs.readFileSync('src/app/api/work-orders/[id]/tasks/[taskId]/route.ts', 'utf8');

describe('PM checklist completion contract', () => {
  it('snapshots template tasks when every PM generation engine creates a work order', () => {
    expect(helper).toContain('workOrderTaskExecution.createMany');
    expect(helper).toContain('templateTaskId: task.id');
    for (const source of [due, meter, signal]) {
      expect(source).toContain('materializePmTemplateTasks(tx, wo.id, tasks)');
    }
  });

  it('blocks completion when a PM template snapshot is missing or checklist tasks are unresolved', () => {
    expect(readiness).toContain("code: 'PM_CHECKLIST_NOT_MATERIALIZED'");
    expect(readiness).toContain("code: 'TASK_CHECKLIST_INCOMPLETE'");
    expect(readiness).toContain("['pending', 'in_progress', 'failed'].includes(task.status)");
    expect(readiness).toContain('checkTaskChecklistReadiness(wo, blockers)');
  });

  it('allows completed and formally skipped tasks to satisfy checklist resolution', () => {
    expect(readiness).not.toContain("['pending', 'in_progress', 'failed', 'skipped']");
    expect(taskPatch).toContain("status === 'skipped'");
    expect(taskPatch).toContain('A reason is required when skipping a work-order task');
  });

  it('does not let a manual task suppress legacy template materialization', () => {
    expect(taskList).toContain('const hasTemplateSnapshot = existingTasks.some');
    expect(taskList).toContain('if (!hasTemplateSnapshot && wo.pmSchedule?.template?.tasks');
  });
});
