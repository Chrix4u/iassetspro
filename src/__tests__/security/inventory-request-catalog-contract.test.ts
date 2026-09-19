import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Inventory request catalog isolation', () => {
  it('removes broad inventory browsing from the default maintenance technician role', () => {
    for (const seedFile of ['prisma/seed.ts', 'prisma/seed-permissions-only.ts']) {
      const seed = read(seedFile);
      const start = seed.indexOf('maintenance_technician: [');
      const end = seed.indexOf('],', start);
      const bundle = seed.slice(start, end);
      expect(bundle).not.toContain("'inventory.view'");
      expect(bundle).not.toContain("'parts.view'");
      expect(bundle).toContain("'repair_material_requests.create'");
    }
  });

  it('provides a limited request catalog without inventory cost/custody fields', () => {
    const route = read('src/app/api/inventory/route.ts');
    expect(route).toContain("mode === 'request_catalog'");
    expect(route).toContain("'repair_material_requests.create'");
    expect(route).toContain('Insufficient permissions to browse inventory');

    const catalogStart = route.indexOf('if (requestCatalogMode) {', route.indexOf('const where'));
    const fullStart = route.indexOf('const items = await db.inventoryItem.findMany({', catalogStart + 1);
    const catalogBlock = route.slice(catalogStart, route.indexOf("return NextResponse.json({ success: true, data: catalogItems });", catalogStart));
    expect(catalogBlock).toContain('itemCode: true');
    expect(catalogBlock).toContain('currentStock: true');
    expect(catalogBlock).toContain('unitOfMeasure: true');
    expect(catalogBlock).not.toContain('unitCost: true');
    expect(catalogBlock).not.toContain('supplier: true');
    expect(fullStart).toBeGreaterThan(catalogStart);
  });

  it('uses catalog mode from repair and work-order forms', () => {
    const repairs = read('src/components/modules/RepairsPagesLegacy.tsx');
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    expect(repairs).toContain('/api/inventory?mode=request_catalog');
    expect(maintenance).toContain('/api/inventory?mode=request_catalog');
    expect(repairs).not.toContain('/api/inventory?limit=500');
    expect(maintenance).not.toContain("/api/inventory?limit=100");
  });

  it('migrates existing technician role assignments away from inventory browsing', () => {
    const migration = read('prisma/migrations/20260919030000_tighten_technician_inventory_access/migration.sql');
    expect(migration).toContain("r.\`slug\` = 'maintenance_technician'");
    expect(migration).toContain("'inventory.view'");
    expect(migration).toContain("'parts.view'");
  });
});
