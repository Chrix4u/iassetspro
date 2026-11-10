import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('early inspections must retain corrective WO generation for actual alarms', () => {
  it('skips only unavailable measurements, and preserves fail/attention corrective routing', () => {
    const source = readFileSync(
      'src/app/api/pm-inspections/[pointId]/records/route.ts','utf8');
    expect(source).toContain('if (notMeasured) {');
    expect(source).toContain('} else if (!inspection.isAlarm && !workOrder) {');
    expect(source).toContain('} else if (!inspection.isAlarm) {');
    expect(source).toContain('} else {\n        // A failed inspection does not reset due date.');
    expect(source).toContain('if (mayAdvanceDue && inspectionMayAdvanceDue(purpose, inspection.outcome))');
    expect(source).not.toContain('notMeasured || !inspectionMayAdvanceDue');
    expect(source).toContain("status: 'draft'");
  });
});
