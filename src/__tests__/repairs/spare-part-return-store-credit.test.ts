import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const custody = fs.readFileSync('src/services/materialCustody.service.ts', 'utf8');

describe('spare-part return store credit', () => {
  it('never defaults an invalid return quantity to one unit of inventory', () => {
    expect(custody).toContain("const returnQuantity = positiveQuantity(record.quantity, 'Spare part quantity')");
    expect(custody).toContain('delta: returnQuantity');
    expect(custody).not.toContain('delta: record.quantity || 1');
  });
});
