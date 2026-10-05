import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/mobile/sync/route.ts', 'utf8');

describe('offline mobile sync security contract', () => {
  it('rejects unsupported entities instead of silently marking them completed', () => {
    expect(route).toContain("op.entityType !== 'work_orders' && op.entityType !== 'inspections'");
    expect(route).toContain('Unsupported entity type: ${op.entityType}');
  });

  it('authorizes Work Order execution before applying offline changes', () => {
    expect(route).toContain('authorizeWorkOrderExecutionAccess(req, session, workOrderId)');
    expect(route).toContain('isWorkOrderExecutionMember(session, auth.entity)');
    expect(route).toContain("Offline Work Orders support update operations only");
  });

  it('whitelists execution fields and does not pass arbitrary client objects to WorkOrder update', () => {
    expect(route).toContain('buildWorkOrderFieldUpdate(op.data)');
    expect(route).not.toContain('data: updateData');
    const helperStart = route.indexOf('function buildWorkOrderFieldUpdate');
    const helperEnd = route.indexOf('function inspectionMetrics', helperStart);
    const helper = route.slice(helperStart, helperEnd);
    expect(helper).not.toContain('update.status =');
    expect(helper).toContain('update.failureDescription =');
    expect(helper).toContain('update.actionDescription =');
  });

  it('enforces inspection permission, ownership, and referenced entity access', () => {
    expect(route).toContain("'quality_inspections.create'");
    expect(route).toContain("'quality_inspections.update'");
    expect(route).toContain('inspection.inspectorId !== session.userId');
    expect(route).toContain('authorizeAssetReference(req, session, assetId)');
    expect(route).toContain('authorizeExecutionWorkOrder(req, session, workOrderId)');
  });

  it('stores sync and inspection payloads through Prisma JSON inputs', () => {
    expect(route).toContain('dataJson: jsonInput(op.data)');
    expect(route).toContain('resultsJson: jsonInput(op.data.resultsJson)');
    expect(route).toContain('gpsCoordinates: jsonInput(op.data.gpsCoordinates)');
  });

  it('types sync results explicitly', () => {
    expect(route).toContain('const results: SyncResult[] = []');
  });
});
