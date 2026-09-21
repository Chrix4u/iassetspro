import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('work-order rework UI routing', () => {
  it('routes completed/verified in-progress transitions through canonical rework', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain("['completed', 'verified'].includes(wo.status)");
    expect(ui).toContain("actionName = isRework");
    expect(ui).toContain("case 'rework':");
    expect(ui).toContain('/api/work-orders/${id}/rework');
    expect(ui).toContain("label: isRework");
    expect(ui).toContain("'Request Rework'");
    expect(ui).toContain("requiresReason: isRework ? true : t.requiresReason");
  });

  it('keeps ordinary execution resume on the resume endpoint', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain("case 'resume':");
    expect(ui).toContain('/api/work-orders/${id}/resume');
  });
});
