import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const start = source.indexOf('export function PmSchedulesPage()');
const end = source.indexOf('export function MaintenanceDashboardPage()', start);
const page = source.slice(start, end > start ? end : source.length);

describe('PM task-level schedule form contract', () => {
  it('uses the reusable task-level planner and serializes ordered Scheduled Tasks', () => {
    expect(source).toContain("import { PmScheduleTaskPlanner } from '@/components/modules/pm/PmScheduleTaskPlanner'");
    expect(source).toContain("pmScheduleTaskDraftFromApi");
    expect(source).toContain("pmScheduleTaskDraftFromMaster");
    expect(source).toContain("pmScheduleTaskPayload");
    expect(page).toContain('const [formScheduledTasks, setFormScheduledTasks]');
    expect(page).toContain('<PmScheduleTaskPlanner');
    expect(page).toContain('payload.scheduledTasks = formScheduledTasks.map((task, index) => pmScheduleTaskPayload(task, index))');
    expect(page).not.toContain('inlineTasks:');
    expect(page).not.toContain('requiredPartsText');
  });

  it('does not author Schedule Description or header cadence for a new task-level schedule', () => {
    expect(page).toContain('const isLegacyScheduleEdit =');
    expect(page).toContain('{!isLegacyScheduleEdit ? (');
    expect(page).toContain('Legacy schedule compatibility mode');
    expect(page).not.toContain('Describe the maintenance tasks...');
    expect(page).toContain('Automatic work-order generation evaluates each Scheduled Task independently using TBM/UBM/CBM due logic');
    expect(page).toContain('recurrence advances only after verified planner closeout.');
  });

  it('requires one or more scheduled Task Library records on the task-level path', () => {
    expect(page).toContain('if (!isLegacyScheduleEdit && formScheduledTasks.length === 0)');
    expect(page).toContain("toast.error('Add at least one Task Library record to this schedule')");
  });

  it('seeds template starters from permanent Task Masters instead of copied checklist text', () => {
    expect(page).toContain('task.pmTaskId && task.masterTaskNumber !== null && task.discipline');
    expect(page).toContain('pmScheduleTaskDraftFromMaster({');
    expect(page).toContain('id: task.pmTaskId');
    expect(page).toContain('taskNumber: task.masterTaskNumber');
    expect(page).not.toContain('pmScheduleTaskDraft(task, index)');
  });

  it('loads persisted Scheduled Tasks for task-level edits and leaves legacy schedules in compatibility mode', () => {
    expect(page).toContain('detail.scheduledTasks');
    expect(page).toContain('pmScheduleTaskDraftFromApi');
    expect(page).toContain('isLegacyScheduleEdit');
    expect(page).toContain('Legacy header cadence');
  });

  it('locks the asset identity while editing an existing schedule', () => {
    expect(page).toContain('disabled={Boolean(editItem)}');
    expect(page).toContain('Asset is fixed after schedule creation. Create a new schedule to move this plan to another asset.');
  });

  it('uses the shipped task engines for task-level automatic generation', () => {
    expect(page).toContain('Task-level automation');
    expect(page).toContain('TBM/UBM/CBM due logic');
    expect(page).toContain("'Generate preventive work orders when individual Scheduled Tasks enter their due window or threshold.'");
    expect(page).not.toContain('Task-level automation is staged safely');
    expect(page).not.toContain('Legacy automatic generation stays disabled');
  });
});
