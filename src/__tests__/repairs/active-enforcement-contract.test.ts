import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/work-orders/active-enforcement/route.ts', 'utf8');

describe('active work-order enforcement contracts', () => {
  it('applies plant scope to work-order and asset queries', () => {
    expect(route).toContain('const workOrderPlantFilter = getPlantFilterWhere(plantScope);');
    expect(route).toContain("status: 'in_progress',\n        ...workOrderPlantFilter");
    expect(route).toContain('where: { id: { in: assetIds }, ...getPlantFilterWhere(plantScope) }');
  });

  it('combines direct assignments and team membership before the WorkOrder query', () => {
    expect(route).toContain('select: { workOrderId: true }');
    expect(route).toContain("? { OR: [{ assignedTo: session.userId }, { id: { in: teamWorkOrderIds } }] }");
    expect(route).not.toContain('include: {\n        asset:');
    expect(route).not.toContain('tm.workOrder');
  });

  it('uses the canonical open-session rule instead of action alone', () => {
    expect(route).toContain("(latestLog.action === 'start' || latestLog.action === 'resume') && latestLog.endTime === null");
    expect(route).toContain('unclosedSince = latestLog.startTime || latestLog.timestamp;');
  });

  it('enriches asset data without a stale WorkOrder.asset relation', () => {
    expect(route).toContain('const assetById = new Map(assets.map((asset) => [asset.id, asset]));');
    expect(route).toContain("asset: wo.assetId ? (assetById.get(wo.assetId) ?? { id: wo.assetId, name: wo.assetName || 'Unknown asset', assetTag: null }) : null");
  });
});
