import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const packages = readFileSync('src/app/api/mobile/sync/packages/route.ts', 'utf8');
const geofence = readFileSync('src/app/api/mobile/geofence/route.ts', 'utf8');

describe('offline package and geofence plant boundaries', () => {
  it('validates requested package plant and applies canonical plant filters', () => {
    expect(packages).toContain('const plantScope = await getPlantScope(req, session)');
    expect(packages).toContain('canAccessPlantStrict(plantScope, plantId)');
    expect(packages).toContain('const plantFilter = plantId ? { plantId } : getPlantFilterWhere(plantScope)');
  });

  it('downloads only Work Orders related to the current execution user', () => {
    expect(packages).toContain("status: { in: ['assigned', 'in_progress'] }");
    expect(packages).toContain('{ assignedTo: session.userId }');
    expect(packages).toContain('{ teamLeaderId: session.userId }');
    expect(packages).toContain('teamMembers: {');
    const relationBlock = packages.slice(packages.indexOf("case 'work_orders'"), packages.indexOf("case 'assets'"));
    expect(relationBlock).not.toContain("{ status: { in: ['assigned', 'in_progress'] } },");
  });

  it('rejects unsupported package types and validates incremental timestamps', () => {
    expect(packages).toContain('const allowedEntityTypes = new Set([');
    expect(packages).toContain('Unsupported offline entity type: ${unsupported.join');
    expect(packages).toContain('sinceVersion must be a non-negative timestamp');
  });

  it('plant-scopes geofence reads and events', () => {
    expect(geofence).toContain('getPlantFilterWhere(plantScope)');
    expect(geofence).toContain('canAccessPlantStrict(plantScope, plantId)');
    expect(geofence).toContain('canAccessPlantStrict(plantScope, zone.plantId)');
    expect(geofence).toContain('plantId: true');
  });

  it('persists geofence coordinates as Prisma JSON rather than JSON text', () => {
    expect(geofence).toContain('coordinates: coordinates === undefined ? undefined : jsonInput(coordinates)');
    expect(geofence).not.toContain('JSON.stringify(coordinates)');
  });
});
