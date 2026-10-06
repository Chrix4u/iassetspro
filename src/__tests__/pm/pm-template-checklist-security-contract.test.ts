import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const templateCollection = fs.readFileSync('src/app/api/pm-templates/route.ts', 'utf8');
const templateDirect = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');
const templateTasks = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/route.ts', 'utf8');
const checklistCollection = fs.readFileSync('src/app/api/checklists/route.ts', 'utf8');
const checklistDirect = fs.readFileSync('src/app/api/checklists/[id]/route.ts', 'utf8');
const checklistScope = fs.readFileSync('src/lib/pm-checklist-scope.ts', 'utf8');

describe('PM template and checklist security contract', () => {
  it('requires explicit view permissions on PM template reads', () => {
    expect(templateCollection).toContain("hasPermission(session, 'pm_templates.view')");
    expect(templateDirect).toContain("hasPermission(session, 'pm_templates.view')");
  });

  it('requires explicit view permissions on checklist reads', () => {
    expect(checklistCollection).toContain("hasPermission(session, 'pm_checklists.view')");
    expect(checklistDirect).toContain("hasPermission(session, 'pm_checklists.view')");
  });

  it('derives checklist visibility from accessible asset and department plants while preserving global checklists', () => {
    expect(checklistCollection).toContain('buildChecklistScopeWhere(plantScope)');
    expect(checklistScope).toContain('db.asset.findMany');
    expect(checklistScope).toContain('db.department.findMany');
    expect(checklistScope).toContain('{ assetId: null, departmentId: null }');
  });

  it('validates checklist targets on create, update and direct access', () => {
    expect(checklistCollection).toContain('validateChecklistTargets');
    expect(checklistDirect).toContain('validateChecklistTargets');
    expect(checklistDirect).toContain('canAccessChecklistTargets');
    expect(checklistScope).toContain('Asset and department must belong to the same plant');
    expect(checklistScope).toContain('canAccessPlantStrict');
  });

  it('honors the checklist delete permission instead of hard-coding the admin role', () => {
    expect(checklistDirect).toContain("hasPermission(session, 'pm_checklists.delete')");
    expect(checklistDirect).not.toContain("session.roles.includes('admin')");
    expect(checklistDirect).toContain('await db.$transaction(async (tx) =>');
  });

  it('serializes task numbering and rejects cross-template, duplicate or partial reorder sets', () => {
    expect(templateTasks).toContain('iassetspro:pm-template-task-order:${id}');
    expect(templateTasks).toContain('taskIds must not contain duplicates');
    expect(templateTasks).toContain('Every active task must belong to this template before reordering');
    expect(templateTasks).toContain('where: { id: taskId, templateId: id, isActive: true }');
  });
});
