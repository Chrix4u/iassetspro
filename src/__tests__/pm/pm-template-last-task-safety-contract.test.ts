import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = fs.readFileSync('src/services/pm/pmTemplateTaskAssociation.service.ts', 'utf8');

describe('PM template last-task safety contract', () => {
  it('refuses to remove the final active association inside the canonical mutation transaction', () => {
    expect(service).toContain('lockPmTemplateLifecycle(tx, input.templateId)');
    expect(service).toContain('tx.pmSchedule.findFirst');
    expect(service).toContain('templateId: input.templateId');
    expect(service).toContain('isActive: true');
    expect(service).toContain('tx.pmTemplateTask.count');
    expect(service).toContain('activeTaskCount <= 1');
    expect(service).toContain('last active task');
  });
});
