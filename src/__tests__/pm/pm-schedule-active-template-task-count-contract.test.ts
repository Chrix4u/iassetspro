import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const ACTIVE_TASK_COUNT = "tasks: { where: { isActive: true } }";

describe('PM schedule active template task count contract', () => {
  it('returns active template-task counts in schedule collection responses', () => {
    expect(collection).toContain(ACTIVE_TASK_COUNT);
    expect(collection).not.toContain('select: { tasks: true }');
  });

  it('returns active template-task counts in schedule detail/update responses', () => {
    expect(detail).toContain(ACTIVE_TASK_COUNT);
    expect(detail).not.toContain('select: { tasks: true }');
  });
});
