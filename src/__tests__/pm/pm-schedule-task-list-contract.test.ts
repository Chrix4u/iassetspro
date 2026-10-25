import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('PM schedule task-list workflow contract', () => {
  it('creates schedule-owned checklist snapshots without mutating reusable templates', () => {
    const createRoute = read('src/app/api/pm-schedules/route.ts');
    const updateRoute = read('src/app/api/pm-schedules/[id]/route.ts');
    for (const source of [createRoute, updateRoute]) {
      expect(source).toContain('normalizePmScheduleTasks');
      expect(source).toContain('createPmScheduleTaskSnapshot');
      expect(source).toContain('inlineTasks');
    }
    expect(updateRoute).not.toContain('pmTemplateTask.updateMany');
    expect(updateRoute).not.toContain('pmTemplateTask.deleteMany');
  });

  it('keeps schedule snapshots out of the reusable PM Template picker', () => {
    const templates = read('src/app/api/pm-templates/route.ts');
    expect(templates).toContain('PM_SCHEDULE_SNAPSHOT_CATEGORY');
    expect(templates).toContain('{ category: null }');
    expect(templates).toContain('{ category: { not: PM_SCHEDULE_SNAPSHOT_CATEGORY } }');
    expect(templates).toContain('where.AND');
  });

  it('returns resolved master-aware schedule task details through the schedule endpoint', () => {
    const detail = read('src/app/api/pm-schedules/[id]/route.ts');
    expect(detail).toContain("tasks: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { taskNumber: 'asc' }, { id: 'asc' }], include: { pmTask: true }");
    expect(detail).toContain('resolvePmTemplateTasks(schedule.template.tasks)');
    expect(detail).toContain('template: resolvedTemplate');
  });

  it('shows Assigned To, Department and the Task Master planner in the schedule form', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain('>Assigned To</Label>');
    expect(ui).toContain('>Department</Label>');
    expect(ui).toContain('<PmScheduleTaskPlanner');
    expect(ui).toContain('formScheduledTasks');
    expect(ui).toContain('payload.scheduledTasks = formScheduledTasks.map');
    expect(ui).toContain("api.get(`/api/pm-templates/${templateId}`)");
    expect(ui).toContain('pmScheduleTaskDraftFromMaster({');
    expect(ui).toContain("api.get(`/api/pm-schedules/${item.id}`)");
    expect(ui).not.toContain('inlineTasks:');
  });

  it('shows the saved checklist in the schedule detail view', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain('viewItem.template?.tasks');
    expect(ui).toContain('PM Task List');
    expect(ui).toContain('viewItem.assignedTo?.fullName');
    expect(ui).toContain('viewItem.department?.name');
  });

  it('uses permanent Task Masters with task-level mode and ordering controls', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    const card = read('src/components/modules/pm/PmScheduleTaskCard.tsx');
    expect(ui).toContain('pmScheduleTaskDraftFromMaster');
    expect(ui).toContain('pmScheduleTaskDraftFromApi');
    expect(card).toContain('Task #');
    expect(card).toContain('TBM');
    expect(card).toContain('UBM');
    expect(card).toContain('CBM');
    expect(card).toContain('Move Task #');
    expect(card).toContain('Remove Task #');
  });

});
