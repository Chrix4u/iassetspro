import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');

describe('PM template task history contract', () => {
  it('soft-deactivates template tasks so historical work-order task links remain valid', () => {
    expect(route).toContain('tx.pmTemplateTask.update');
    expect(route).toContain('data: { isActive: false }');
    expect(route).not.toContain('tx.pmTemplateTask.delete');
    expect(route).toContain("newValues: JSON.stringify({ isActive: false })");
  });
});
