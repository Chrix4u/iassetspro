import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('material reconciliation authorization contract', () => {
  it('uses the canonical store-role guard on the dedicated reconcile endpoint', () => {
    const route = read('src/app/api/repairs/material-requests/reconcile/route.ts');

    expect(route).toContain("import { isResourceStoreActor } from '@/lib/resource-request-approval';");
    expect(route).toContain('if (!isResourceStoreActor(session))');
    expect(route).not.toContain("hasPermission(session, 'repair_material_requests.update')");
    expect(route).toContain('store keeper, inventory manager, or tools shop attendant can reconcile material requests');
  });

  it('only shows issued-material reconciliation and return actions to store actors', () => {
    const page = read('src/components/modules/RepairsPagesLegacy.tsx');

    expect(page).toContain("{r.status === 'issued' && canApproveAsStore(user) && (");
    expect(page).toContain("(detailItem.status === 'issued' && canApproveAsStore(user))");
    expect(page).not.toContain("storeRoles.includes(slug)) || hasPermission('repair_material_requests.update')");
  });
});
