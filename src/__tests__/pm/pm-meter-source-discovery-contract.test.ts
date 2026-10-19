import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const maintenancePage = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const proxySource = fs.readFileSync('src/proxy.ts', 'utf8');
const routePath = 'src/app/api/pm-schedules/meter-sources/route.ts';

describe('PM meter-source discovery contract', () => {
  it('discovers meter sources through the PM module instead of the separately licensed Operations meter API', () => {
    expect(maintenancePage).toContain('/api/meter-readings?assetId=');
    expect(proxySource).toContain("{ prefix: '/api/pm-schedules', modules: ['pm_schedules'] }");
    expect(proxySource).toContain('/api/pm-schedules/meter-sources');
    expect(proxySource).toContain('NextResponse.rewrite');
  });

  it('provides a plant-scoped read-only PM meter-source route', () => {
    expect(fs.existsSync(routePath)).toBe(true);
    if (!fs.existsSync(routePath)) return;

    const route = fs.readFileSync(routePath, 'utf8');
    expect(route).toContain("const assetId = searchParams.get('assetId')");
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlantStrict(plantScope, asset.plantId)');
    expect(route).toContain('db.meterReading.findMany');
    expect(route).toContain('orderBy: { readingDate: \'desc\' }');
    expect(route).toContain("distinct: ['meterName', 'unit']");
    expect(route).not.toContain('export async function POST');
  });
});
