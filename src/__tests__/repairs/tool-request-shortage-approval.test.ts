import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/repairs/tool-requests/[id]/route.ts', 'utf8');
const operations = fs.readFileSync('src/services/toolOperations.service.ts', 'utf8');

describe('tool request shortage approval', () => {
  it('preserves the repair requirement when supervisor approval happens during a shortage', () => {
    expect(route).not.toContain('Math.min(item.quantityRequested, item.tool.quantity)');
    expect(route).toContain('quantityApproved: item.quantityRequested');
    expect(route).toContain('can be fulfilled after replenishment');
  });

  it('still enforces approved quantity and actual stock at physical issue time', () => {
    expect(operations).toContain('lineItem.quantityApproved ?? lineItem.quantityRequested');
    expect(operations).toContain('const actualIssued = Math.min(qtyToIssue, tool.quantity)');
  });
});
