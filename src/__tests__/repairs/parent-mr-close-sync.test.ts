import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/services/workOrderClosure.service.ts', 'utf8');

describe('work order closure synchronizes parent maintenance request', () => {
  it('advances the linked maintenance request workflow to closed on canonical WO close', () => {
    expect(source).toContain("data: { workflowStatus: 'closed' }");
    expect(source).toContain("entityType',");
    expect(source).toContain("'maintenance_request'");
  });

  it('repairs older closed work orders whose parent MR is still work_order_created', () => {
    expect(source).toContain('repairedByIdempotentClose: true');
    expect(source).toContain("workflowStatus: { not: 'closed' }");
  });

  it('does not rewrite the canonical maintenance request status field', () => {
    expect(source).not.toContain("data: { status: 'closed'");
  });
});
