import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const route = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');

describe('PM template edit integrity', () => {
  it('persists edited required skills and tools through the update API', () => {
    expect(page).toContain('requiredSkills: skillsArray');
    expect(page).toContain('requiredTools: toolsArray');
    expect(route).toContain("'requiredSkills', 'requiredTools'");
    expect(route).toContain("updateData[field] = value.length > 0 ? JSON.stringify(value) : null");
  });

  it('rejects malformed skills and tools payloads instead of storing invalid JSON', () => {
    expect(route).toContain("!Array.isArray(value) || !value.every((item) => typeof item === 'string')");
    expect(route).toContain('must be an array of strings');
  });

  it('uses PM template permissions instead of work-order permissions in the template UI', () => {
    expect(page).toContain("hasPermission('pm_templates.create')");
    expect(page).toContain("hasPermission('pm_templates.update')");
    expect(page).toContain("hasPermission('pm_templates.delete')");
    const templatePageStart = page.indexOf('export function PmTemplatesPage()');
    const templatePageEnd = page.indexOf('// INVENTORY SUBPAGES', templatePageStart);
    const templatePage = page.slice(templatePageStart, templatePageEnd);
    expect(templatePage).not.toContain("hasPermission('work_orders.create')");
    expect(templatePage).toContain('{canCreateTemplate && (');
  });

  it('keeps required skills and tools editable for existing templates', () => {
    const templatePageStart = page.indexOf('export function PmTemplatesPage()');
    const templatePageEnd = page.indexOf('// INVENTORY SUBPAGES', templatePageStart);
    const templatePage = page.slice(templatePageStart, templatePageEnd);
    expect(templatePage).toContain('value={formSkills}');
    expect(templatePage).toContain('value={formTools}');
    expect(templatePage).not.toContain('!editItem && (');
  });

  it('does not show two separate Deactivate actions to users who can update templates', () => {
    expect(page).toContain('!canUpdateTemplate && canDeleteTemplate && t.isActive');
  });
});
