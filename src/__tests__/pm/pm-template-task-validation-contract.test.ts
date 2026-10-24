import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');
const pmTask = fs.readFileSync('src/lib/pm-task.ts', 'utf8');
const associationService = fs.readFileSync('src/services/pm/pmTemplateTaskAssociation.service.ts', 'utf8');
const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const taskList = fs.readFileSync('src/components/modules/pm/PmTemplateTaskList.tsx', 'utf8');

describe('PM template task authoring contract', () => {
  it('validates new template tasks through the canonical Task Master disciplines', () => {
    expect(pmTask).toContain("PM_TASK_TYPES = ['mechanical', 'electrical', 'plumbing', 'lubrication'] as const");
    expect(pmTask).toContain('PM_TASK_TYPES.includes(rawType as PmTaskType)');
    expect(collection).toContain('createAndLinkPmTasks');
    expect(collection).toContain('PmTaskBatchValidationError');
    expect(collection).toContain('rows: body.newTasks');
    expect(collection).not.toContain('VALID_TASK_TYPES');
  });

  it('creates master-linked compatibility rows without template-local parts or duration authoring', () => {
    expect(collection).toContain('Provide exactly one of taskIds or newTasks');
    expect(collection).not.toContain('estimatedMinutes');
    expect(collection).not.toContain('requiredParts');
    expect(associationService).toContain("taskType: 'check'");
    expect(associationService).toContain('requiredParts: null');
    expect(associationService).toContain('estimatedMinutes: null');
  });

  it('treats task removal as template editing and gates the reusable list accordingly', () => {
    expect(detail).toContain("hasPermission(session, 'pm_templates.update')");
    expect(detail).not.toContain("hasPermission(session, 'pm_templates.delete')");
    expect(page).toContain("disabled={!canUpdateTemplate || templateTaskBusyId === 'reorder'}");
    expect(taskList).toContain("!disabled && <Button");
    expect(taskList).toContain('Remove from Template');
  });
});
