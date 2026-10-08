import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('RWOP material issue/return quantity contract', () => {
  const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
  const route = read('src/app/api/repairs/material-requests/[id]/route.ts');

  it('issues the full reserved quantity instead of offering an invalid partial-issue dialog', () => {
    expect(route).toContain("const qtyToIssue = approvedQuantity ?? quantityApproved ?? matReq.quantityApproved");
    expect(ui).toContain("handleAction(r.id, 'issue', { approvedQuantity: r.quantityApproved })");
    expect(ui).toContain("handleAction(detailItem.id, 'issue', { approvedQuantity: detailItem.quantityApproved })");
    expect(ui).not.toContain("setQtyTarget({ id: r.id, action: 'issue'");
    expect(ui).not.toContain("setQtyTarget({ id: detailItem.id, action: 'issue'");
  });

  it('submits physical return quantity using the API return field', () => {
    expect(route).toContain("const qtyToReturn = approvedQuantity ?? quantityApproved ?? quantityReturned ?? 0");
    expect(ui).toContain("action: 'record_return', max: Math.max(0, (r.quantityIssued || 0) - (r.quantityReturned || 0)), field: 'quantityReturned'");
    expect(ui).toContain("action: 'record_return', max: Math.max(0, (detailItem.quantityIssued || 0) - (detailItem.quantityReturned || 0)), field: 'quantityReturned'");
    expect(ui).not.toContain("field: 'quantityToReturn'");
  });
});
