import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/app/api/work-orders/[id]/tasks/route.ts'), 'utf8');

describe('task-level PM checklist fallback contract', () => {
  it('treats either legacy template or Scheduled Task provenance as an already materialized PM snapshot', () => {
    expect(source).toContain('task.templateTaskId || task.pmScheduleTaskId');
    expect(source).toContain('if (!hasTemplateSnapshot && wo.pmSchedule?.template?.tasks');
  });
});
