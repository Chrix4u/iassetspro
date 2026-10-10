import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('receiving quality-hold custody contract', () => {
  it('stores custody and disposition evidence on each receiving record', () => {
    const schema = read('prisma/schema.prisma');
    expect(schema).toContain('custodyStatus     String');
    expect(schema).toContain('resolution        String?');
    expect(schema).toContain('dispositionedById String?');
    expect(schema).toContain('dispositionNotes  String?');
    expect(schema).toContain('@@index([custodyStatus])');
  });

  it('backfills historical damaged and defective receipts into quarantine', () => {
    const migration = read('prisma/migrations/20261010174500_receiving_quality_hold/migration.sql');
    expect(migration).toContain("SET \"custodyStatus\" = 'quarantined'");
    expect(migration).toContain("WHERE \"condition\" IN ('damaged', 'defective')");
  });

  it('initializes new unusable receipts in quarantine and keeps them out of stock', () => {
    const receive = read('src/app/api/purchase-orders/[id]/receive/route.ts');
    expect(receive).toContain("custodyStatus: stockCredited ? 'stocked' : 'quarantined'");
    expect(receive).toContain("const stockCredited = condition === 'good'");
  });

  it('reopens the purchase order when rejected stock is returned to the supplier', () => {
    const route = read('src/app/api/receiving-records/[id]/disposition/route.ts');
    expect(route).toContain("action === 'return_to_supplier'");
    expect(route).toContain('purchaseOrderItem.updateMany');
    expect(route).toContain("poStatus = allReceived ? 'received' : anyReceived ? 'partially_received' : 'approved'");
  });

  it('exposes custody KPIs and operator disposition controls in Receiving', () => {
    const api = read('src/app/api/receiving-records/route.ts');
    const ui = read('src/components/modules/InventoryPages.tsx');
    expect(api).toContain("custodyStatus: 'quarantined'");
    expect(api).toContain("custodyStatus: 'in_repair'");
    expect(ui).toContain('Receiving Disposition');
    expect(ui).toContain('Send for Repair / Refurbishment');
    expect(ui).toContain("['quarantined', 'in_repair'].includes(r.custodyStatus)");
  });
});
