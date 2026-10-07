import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const detail = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');

describe('PM template last-task safety contract', () => {
  it('refuses to remove the final active task while an active schedule uses the template', () => {
    expect(detail).toContain('tx.pmSchedule.findFirst');
    expect(detail).toContain('templateId: id');
    expect(detail).toContain('isActive: true');
    expect(detail).toContain('tx.pmTemplateTask.count');
    expect(detail).toContain('activeTaskCount <= 1');
    expect(detail).toContain('last active task');
    expect(detail).toContain('status: 409');
  });
});
