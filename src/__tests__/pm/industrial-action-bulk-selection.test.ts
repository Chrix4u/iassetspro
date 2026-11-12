import { describe, expect, it } from 'vitest';
import { machineChecklistHasInput } from '@/lib/pm-machine-checklist';

describe('industrial inspection bulk-entry selection', () => {
  const normal = { value: '', findings: '', outcome: 'pass' as const };
  const measured = { inspectionType: 'measurement' };
  const visual = { inspectionType: 'visual' };

  it('ignores a shared remark by itself on an unmeasured instrument checkpoint', () => {
    expect(machineChecklistHasInput(measured, { ...normal, findings: 'Rust present on nearby guard' })).toBe(false);
    expect(machineChecklistHasInput(measured, { ...normal, findings: 'Operator noted a concern', value: '82.5' })).toBe(true);
  });
  it('still records explicit N/A, needs-attention and defect assessments', () => {
    expect(machineChecklistHasInput(measured, { ...normal, outcome: 'not_measured' })).toBe(true);
    expect(machineChecklistHasInput(measured, { ...normal, outcome: 'needs_attention' })).toBe(true);
    expect(machineChecklistHasInput(measured, { ...normal, outcome: 'fail' })).toBe(true);
  });
  it('requires a real visual observation or explicit abnormal assessment', () => {
    expect(machineChecklistHasInput(visual, normal)).toBe(false);
    expect(machineChecklistHasInput(visual, { ...normal, findings: 'No rust visible at the joint' })).toBe(true);
    expect(machineChecklistHasInput(visual, { ...normal, outcome: 'fail' })).toBe(true);
  });
});
