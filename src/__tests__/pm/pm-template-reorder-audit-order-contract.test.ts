import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = fs.readFileSync('src/services/pm/pmTemplateTaskAssociation.service.ts', 'utf8');

describe('PM template reorder audit ordering contract', () => {
  it('reads the immediately preceding active association order under the canonical order lock', () => {
    const start = service.indexOf('export async function reorderPmTemplateTasks');
    expect(start).toBeGreaterThan(0);
    const section = service.slice(start);
    expect(section).toContain('await lockTemplateOrder(tx, input.templateId)');
    expect(section).toContain('const active = (await loadTemplateAssociations');
    expect(section).toContain('active.map((row) => row.id)');
    expect(section).toContain('active.length !== associationIds.length');
    expect(section).toContain("event: 'reorder_template_tasks'");
    expect(section).toContain('data: { sortOrder }');
    expect(section).not.toContain('data: { taskNumber');
  });
});
