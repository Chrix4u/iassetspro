import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('installed spare lifecycle contract', () => {
  it('tracks installed physical spares without becoming a second stock ledger', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read('prisma/migrations/20260926174500_installed_spare_lifecycle/migration.sql');
    const route = read('src/app/api/component-registry/[id]/installed-parts/route.ts');
    const removal = read('src/app/api/component-registry/[id]/installed-parts/[installedPartId]/route.ts');

    expect(schema).toContain('model InstalledSparePart');
    expect(schema).toContain('materialRequestId String?');
    expect(schema).toContain('workOrderId       String?');
    expect(schema).toContain('installedById');
    expect(schema).toContain('removedById');

    expect(migration).toContain('installed_spare_parts_active_serial_key');
    expect(migration).toContain("WHERE \"serialNumber\" IS NOT NULL AND \"status\" = 'installed'");

    expect(route).toContain("status: 'installed'");
    expect(route).toContain('authoritativeQty');
    expect(route).toContain('alreadyTracked');
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlant(plantScope, component.asset?.plantId)');
    expect(route).not.toContain('db.inventoryItem.update');
    expect(route).not.toContain('db.inventoryItem.updateMany');
    expect(route).not.toContain('db.stockMovement.create');

    expect(removal).toContain("status === 'returned_to_store'");
    expect(removal).toContain('Complete the spare-part return workflow to restore store stock');
    expect(removal).not.toContain('db.inventoryItem.update');
    expect(removal).not.toContain('db.inventoryItem.updateMany');
    expect(removal).not.toContain('db.stockMovement.create');
  });
});
