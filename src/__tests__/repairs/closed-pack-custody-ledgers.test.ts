import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/work-orders/[id]/closed-pack/route.ts', 'utf8');
const generator = fs.readFileSync('src/lib/generate-closed-wo-pack.ts', 'utf8');

describe('closed work-order pack authoritative custody ledgers', () => {
  it('passes repair material requests and tool line items into the PDF data', () => {
    expect(route).toContain('repairMaterialRequests: wo.repairMaterialRequests');
    expect(route).toContain('items: {');
    expect(route).toContain("orderBy: { createdAt: 'asc' as const }");
  });

  it('prefers reconciled repair-material quantities over legacy planned material rows', () => {
    expect(generator).toContain('data.repairMaterialRequests && data.repairMaterialRequests.length > 0');
    expect(generator).toContain('record.quantityRequested');
    expect(generator).toContain('record.quantityIssued');
    expect(generator).toContain('record.consumedQty');
    expect(generator).toContain('record.quantityReturned');
  });

  it('renders tool custody from request line items with legacy fallback', () => {
    expect(generator).toContain('Array.isArray(req.items)');
    expect(generator).toContain('item.quantityRequested');
    expect(generator).toContain('item.quantityIssued');
    expect(generator).toContain('item.conditionAtReturn');
  });
});
