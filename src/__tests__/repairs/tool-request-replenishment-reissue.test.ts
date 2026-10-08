import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const operations = fs.readFileSync('src/services/toolOperations.service.ts', 'utf8');

describe('tool request replenishment re-issue', () => {
  it('allows another issue pass for an already partially-issued multi-tool request', () => {
    expect(operations).toContain("['storekeeper_approved', 'issued'].includes(currentRequest.status)");
    expect(operations).toContain("currentRequest.status === 'issued' && toolReq.items.length === 0");
  });

  it('caps each new issue by the remaining approved quantity and records it cumulatively', () => {
    expect(operations).toContain('const alreadyIssued = lineItem.quantityIssued ?? 0');
    expect(operations).toContain('const remainingApproved = Math.max(0, approvedTotal - alreadyIssued)');
    expect(operations).toContain('const nextIssued = alreadyIssued + actualIssued');
    expect(operations).toContain('quantityIssued: lineItem.quantityIssued');
    expect(operations).toContain('quantityIssued: nextIssued');
  });

  it('does not undo an existing issued state when a later replenishment attempt issues nothing', () => {
    expect(operations).toContain("actualIssuedTotal === 0 && currentRequest.status === 'storekeeper_approved'");
    expect(operations).toContain('No additional items were issued');
  });
});
