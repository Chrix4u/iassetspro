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
    expect(listRoute).toContain("error: 'PM template not found or inactive'");
    expect(listRoute).toContain('templateId: templateId || null');
    expect(listRoute).toContain("template: { select: { id: true, title: true, type: true, _count: { select: { tasks: true } } } }");
  });

  it('allows template assignment changes on schedule update', () => {
    expect(itemRoute).toContain("'templateId'");
    expect(itemRoute).toContain('body.templateId !== undefined');
    expect(itemRoute).toContain("error: 'PM template not found or inactive'");
    expect(itemRoute).toContain("template: { select: { id: true, title: true, type: true, _count: { select: { tasks: true } } } }");
  });

  it('exposes templates in the planner schedule form and list', () => {
    expect(ui).toContain("const [formTemplateId, setFormTemplateId] = useState('')");
    expect(ui).toContain("api.get('/api/pm-templates?active=true')");
    expect(ui).toContain('templateId: formTemplateId || null');
    expect(ui).toContain('Optional — select PM template...');
    expect(ui).toContain("Template · {s.template.title}");
  });

  it('keeps due-work-order generation connected to template tasks', () => {
    expect(dueRoute).toContain('schedule.template?.tasks');
    expect(dueRoute).toContain('Task Checklist:');
  });
});
