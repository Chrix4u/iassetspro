import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');
const service = fs.readFileSync('src/services/pm/pmTemplateTaskAssociation.service.ts', 'utf8');

describe('PM template task history contract', () => {
  it('soft-deactivates template associations in the canonical service so historical work-order links remain valid', () => {
    expect(route).toContain('deactivatePmTemplateTask');
    expect(service).toContain('tx.pmTemplateTask.update');
    expect(service).toContain('data: { isActive: false }');
    expect(service).not.toContain('tx.pmTemplateTask.delete');
    expect(service).toContain("event: 'remove_from_template'");
    expect(service).toContain('isActive: false');
  });
});
