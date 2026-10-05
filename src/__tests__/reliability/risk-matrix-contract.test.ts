import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/reliability/risk-matrix/route.ts'), 'utf8');

describe('reliability risk matrix contract', () => {
  it('uses canonical plant scope and rejects inaccessible requested plants', () => {
    expect(route).toContain('const plantScope = await getPlantScope(request, session)');
    expect(route).toContain('...getPlantFilterWhere(plantScope)');
    expect(route).toContain('plantId && !canAccessPlantStrict(plantScope, plantId)');
    expect(route).toContain("error: 'Plant access denied'");
  });

  it('selects active operational assets using the current Asset schema', () => {
    expect(route).toContain('isActive: true');
    expect(route).toContain("status: { notIn: ['decommissioned', 'disposed'] }");
    expect(route).not.toContain("{ status: 'active' }");
    expect(route).not.toContain('workOrders: true');
  });

  it('derives health score from the DigitalTwin relation while preserving response shape', () => {
    expect(route).toContain('digitalTwin: { select: { healthScore: true } }');
    expect(route).toContain('const healthScore = asset.digitalTwin?.healthScore ?? 100');
    expect(route).toContain('healthScore,');
    expect(route).not.toContain('healthScore: asset.healthScore');
  });

  it('continues calculating live failure and open-work-order risk factors by asset id', () => {
    expect(route).toContain('const recentFailures = await db.failureRecord.count');
    expect(route).toContain('const openWOs = await db.workOrder.count');
    expect(route).toContain('assetId: asset.id');
  });
});
