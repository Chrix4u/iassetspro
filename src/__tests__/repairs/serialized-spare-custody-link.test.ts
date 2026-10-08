import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('serialized installed spare custody linkage', () => {
  const schema = read('prisma/schema.prisma');
  const createRoute = read('src/app/api/repairs/spare-part-returns/route.ts');
  const actionRoute = read('src/app/api/repairs/spare-part-returns/[id]/route.ts');
  const custody = read('src/services/materialCustody.service.ts');
  const ui = read('src/components/modules/RepairsPagesLegacy.tsx');

  it('stores a first-class relation from the return to the exact installed spare', () => {
    expect(schema).toContain('installedSparePartId');
    expect(schema).toContain('@relation("InstalledSpareReturn"');
    expect(schema).toContain('sparePartReturn');
  });

  it('derives identity from a removed installed spare instead of trusting typed serial text', () => {
    expect(createRoute).toContain('installedSparePartId');
    expect(createRoute).toContain("status !== 'removed'");
    expect(createRoute).toContain('installedPart.serialNumber');
    expect(createRoute).toContain('installedPart.componentId');
    expect(createRoute).toContain('installedPart.inventoryItemId');
    expect(createRoute).toContain('installedPart.quantity');
  });

  it('keeps installed-part lifecycle synchronized with final return/disposal custody', () => {
    expect(custody).toContain('record.installedSparePartId');
    expect(custody).toContain("status: 'returned_to_store'");
    expect(actionRoute).toContain('installedSparePartId');
    expect(actionRoute).toContain("status: 'scrapped'");
    expect(actionRoute).toContain('Linked installed spare returns cannot be rejected');
  });

  it('lets the operator select a removed installed spare and submits its id', () => {
    expect(ui).toContain('installedSparePartId');
    expect(ui).toContain('Removed installed part');
    expect(ui).toContain('/installed-parts');
  });
});
