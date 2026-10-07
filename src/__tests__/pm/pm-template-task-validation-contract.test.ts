import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');
const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');

describe('PM template task authoring contract', () => {
  it('accepts only the supported PM task types', () => {
    expect(collection).toContain("const VALID_TASK_TYPES = new Set(['check', 'measure', 'inspect', 'lubricate', 'replace', 'record'])");
    expect(collection).toContain('VALID_TASK_TYPES.has(taskType)');
    expect(collection).toContain('Invalid task type');
  });

  it('validates estimated minutes and required parts before persistence', () => {
    expect(collection).toContain('Number.isInteger(normalizedEstimatedMinutes)');
    expect(collection).toContain('Estimated minutes must be a positive whole number');
    expect(collection).toContain("!Array.isArray(requiredParts) || !requiredParts.every((part) => typeof part === 'string' && part.trim().length > 0)");
    expect(collection).toContain('Required parts must be an array of non-empty strings');
  });

  it('treats task removal as template editing and gates the UI accordingly', () => {
    expect(detail).toContain("hasPermission(session, 'pm_templates.update')");
    expect(detail).not.toContain("hasPermission(session, 'pm_templates.delete')");
    const taskListStart = page.indexOf('taskList.map((task) => {');
    const taskListEnd = page.indexOf('Add Task form', taskListStart);
    const taskList = page.slice(taskListStart, taskListEnd);
    expect(taskList).toContain('{canUpdateTemplate && (');
  });
});
