import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-templates/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');

const ACTIVE_TASK_COUNT = "tasks: { where: { isActive: true } }";

describe('PM template active task count contract', () => {
  it('counts only active tasks in template collection responses', () => {
    expect(collection).toContain(ACTIVE_TASK_COUNT);
    expect(collection).not.toContain('select: { tasks: true }');
  });

  it('counts only active tasks after template edits', () => {
    expect(detail).toContain(ACTIVE_TASK_COUNT);
    expect(detail).not.toContain('select: { tasks: true }');
  });
});
