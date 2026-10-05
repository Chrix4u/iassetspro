import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const execution = readFileSync('src/app/api/mobile/execution/route.ts', 'utf8');
const inspections = readFileSync('src/app/api/mobile/inspections/route.ts', 'utf8');

describe('mobile field operations authorization contract', () => {
  it('uses canonical Work Order execution authorization for online field actions', () => {
    expect(execution).toContain('authorizeWorkOrderExecutionAccess(req, session, workOrderId)');
    expect(execution).toContain('isWorkOrderExecutionMember(session, workOrderAuth.entity)');
    expect(execution).not.toContain("OR: [\n          { assignedTo: session.userId }");
  });

  it('prevents non-admin users from browsing another inspector’s records', () => {
    expect(inspections).toContain('inspectorId !== session.userId && !isAdmin(session)');
    expect(inspections).toContain('Cannot view another inspector’s records');
  });

  it('authorizes asset and Work Order references before inspection creation', () => {
    expect(inspections).toContain('authorizeAssetReference(req, session, String(assetId))');
    expect(inspections).toContain('authorizeWorkOrderReference(req, session, String(workOrderId))');
    expect(inspections).toContain('canAccessPlantStrict(scope, asset.plantId)');
  });

  it('persists inspection JSON as JSON values rather than serialized JSON strings', () => {
    expect(inspections).toContain('resultsJson: jsonInput(resultsJson)');
    expect(inspections).toContain('findingsJson: jsonInput(findingsJson)');
    expect(inspections).toContain('photosJson: jsonInput(photosJson)');
    expect(inspections).toContain('gpsCoordinates: jsonInput(gpsCoordinates)');
    expect(inspections).not.toContain('JSON.stringify(gpsCoordinates)');
  });
});
