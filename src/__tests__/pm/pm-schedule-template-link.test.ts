import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const listRoute = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const itemRoute = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const ui = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const dueRoute = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');

describe('PM schedule template linkage', () => {
  it('accepts, validates, persists and returns templateId on create', () => {
    expect(listRoute).toContain('templateId,');
    expect(listRoute).toContain("where: { id: templateId }");
    expect(listRoute).toContain("error: 'PM template must be active and contain at least one active task'");
    expect(listRoute).toContain('let effectiveTemplateId = templateId || null');
    expect(listRoute).toContain('templateId: effectiveTemplateId');
    expect(listRoute).toContain('if (inlineTasksProvided)');
    expect(listRoute).toContain("template: { select: { id: true, title: true, type: true, _count: { select: { tasks: { where: { isActive: true } } } } } }");
  });

  it('allows template assignment changes on schedule update', () => {
    expect(itemRoute).toContain("'templateId'");
    expect(itemRoute).toContain('body.templateId !== undefined');
    expect(itemRoute).toContain("error: 'PM template must be active and contain at least one active task'");
    expect(itemRoute).toContain("template: { select: { id: true, title: true, type: true, _count: { select: { tasks: { where: { isActive: true } } } } } }");
  });

  it('uses templates as Task Master starters for task-level schedules while retaining the template link', () => {
    expect(ui).toContain("const [formTemplateId, setFormTemplateId] = useState('')");
    expect(ui).toContain("api.get('/api/pm-templates?active=true')");
    expect(ui).toContain('templateId: formTemplateId || null');
    expect(ui).toContain('Optional — seed Task Library records from template...');
    expect(ui).toContain('pmScheduleTaskDraftFromMaster({');
    expect(ui).toContain('id: task.pmTaskId');
    expect(ui).toContain('taskNumber: task.masterTaskNumber');
    expect(ui).toContain("Template · {s.template.title}");
  });

  it('keeps due-work-order generation connected to template tasks', () => {
    expect(dueRoute).toContain('schedule.template?.tasks');
    expect(dueRoute).toContain('Task Checklist:');
  });
});
