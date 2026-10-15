import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('maintenance functional-location snapshot write paths', () => {
  const mrRoute = read('src/app/api/maintenance-requests/route.ts');
  const woRoute = read('src/app/api/work-orders/route.ts');
  const conversion = read('src/services/repairPlanning.service.ts');
  const pmDue = read('src/app/api/pm-schedules/check-due/route.ts');

  it('captures and persists a snapshot when a maintenance request is created', () => {
    expect(mrRoute).toContain('buildMaintenanceLocationSnapshot');
    expect(mrRoute).toContain('const maintenanceLocationSnapshot = buildMaintenanceLocationSnapshot');
    expect(mrRoute).toContain('...maintenanceLocationSnapshot');
  });

  it('captures and persists a snapshot for direct work-order creation', () => {
    expect(woRoute).toContain('buildMaintenanceLocationSnapshot');
    expect(woRoute).toContain('const maintenanceLocationSnapshot = buildMaintenanceLocationSnapshot');
    expect(woRoute).toContain('...maintenanceLocationSnapshot');
  });

  it('inherits the maintenance-request snapshot during canonical MR to WO conversion', () => {
    expect(conversion).toContain('getMaintenanceLocationSnapshot');
    expect(conversion).toContain('const inheritedLocation = getMaintenanceLocationSnapshot');
    expect(conversion).toContain('const maintenanceLocationSnapshot = buildMaintenanceLocationSnapshot(inheritedLocation)');
    expect(conversion).toContain('...maintenanceLocationSnapshot');
  });

  it('falls back to the current live location only for old MRs with no snapshot', () => {
    expect(conversion).toContain('getAssetLiveLocationMap');
    expect(conversion).toContain('const liveLocations = mr.assetId');
    expect(conversion).toContain("liveLocations.get(mr.assetId) ?? null");
  });

  it('batch-resolves due-schedule locations before generating PM work orders', () => {
    expect(pmDue).toContain('select: { id: true, assetId: true }');
    expect(pmDue).toContain('const dueLocationMap = await getAssetLiveLocationMap');
    expect(pmDue).toContain('const maintenanceLocationSnapshot = buildMaintenanceLocationSnapshot');
    expect(pmDue).toContain('...maintenanceLocationSnapshot');
    expect(pmDue.indexOf('const dueLocationMap = await getAssetLiveLocationMap')).toBeLessThan(pmDue.indexOf('for (const candidate of dueSchedules)'));
  });
});
