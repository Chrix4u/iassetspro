import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('material reconciliation authorization contract', () => {
  it('uses the canonical store-role guard on the dedicated reconcile endpoint', () => {
    const route = read('src/app/api/repairs/material-requests/reconcile/route.ts');

    expect(route).toContain("import { isResourceStoreActor } from '@/lib/resource-request-approval';");
    expect(route).toContain("if (!isResourceStoreActor(session, 'repair_material_requests.update'))");
    expect(route).toContain('store keeper, inventory manager, or tools shop attendant can reconcile material requests');
  });

  it('keeps final material verification and physical return actions store-controlled', () => {
    const page = read('src/components/modules/RepairsPagesLegacy.tsx');

    expect(page).toContain("['issued', 'partially_returned', 'fully_returned'].includes(r.status) && canApproveAsStore(user, 'repair_material_requests.update')");
    expect(page).toContain("['issued', 'partially_returned', 'fully_returned'].includes(detailItem.status) && canApproveAsStore(user, 'repair_material_requests.update')");
    expect(page).toContain('Verify & Reconcile');
    expect(page).toContain('Verify Return & Reconcile');
    expect(page).toContain('Record Return');
    expect(page).not.toContain("storeRoles.includes(slug)) || hasPermission('repair_material_requests.update')");
  });
});
