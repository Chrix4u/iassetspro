import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('atomic spare removal custody boundary', () => {
  const createRoute = read('src/app/api/repairs/spare-part-returns/route.ts');
  const directRemovalRoute = read('src/app/api/component-registry/[id]/installed-parts/[installedPartId]/route.ts');
  const custody = read('src/services/materialCustody.service.ts');
  const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
  const assetUi = read('src/components/modules/AssetDetailPage.tsx');

  it('requires a mutable repair work order for new removal custody', () => {
    expect(createRoute).toContain('status: true');
    expect(createRoute).toContain('returnableWorkOrderStatuses');
    expect(createRoute).toContain("'waiting_parts'");
    expect(createRoute).toContain("'completed'");
    expect(createRoute).toContain('returnableWorkOrderStatuses.has(wo.status)');
    expect(ui).toContain('planned,assigned,in_progress,on_hold,waiting_parts,waiting_tools,waiting_shutdown,waiting_permit,pending_handover,completed');
  });

  it('requires an exact work-order execution or management relationship before live removal', () => {
    expect(createRoute).toContain('isWorkOrderExecutionMember');
    expect(createRoute).toContain('canManageWorkOrder');
    expect(createRoute).toContain('You are not authorized to remove installed parts for this work order');
  });

  it('accepts an installed physical part and removes it inside the custody transaction', () => {
    expect(createRoute).toContain("installedPart.status !== 'installed' && installedPart.status !== 'removed'");
    expect(createRoute).toContain('removalReason');
    expect(custody).toContain("installedPart.status === 'installed'");
    expect(custody).toContain("where: { id: input.installedSparePartId, status: 'installed' }");
    expect(custody).toContain("status: 'removed'");
    expect(custody).toContain('removedById: input.requestedById');
  });

  it('blocks direct orphaning into removed state outside Spare Part Return', () => {
    expect(directRemovalRoute).toContain('Direct removal is disabled');
    expect(directRemovalRoute).not.toContain("['removed', 'scrapped'].includes(status)");
    expect(assetUi).toContain("navigate('repairs-spare-part-returns'");
    expect(assetUi).not.toContain("status: 'removed'");
  });

  it('lets the operator select the currently installed physical part and records why it is removed', () => {
    expect(ui).toContain('Installed part to remove');
    expect(ui).toContain("part.status === 'installed' || part.status === 'removed'");
    expect(ui).toContain('installedSparePartStatus');
    expect(ui).toContain('removalReason');
    expect(ui).toContain('Why is this installed part being removed?');
  });
});
