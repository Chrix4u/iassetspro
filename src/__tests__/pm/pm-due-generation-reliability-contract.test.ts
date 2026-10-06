import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');

describe('PM due-generation reliability contract', () => {
  it('requires explicit PM run authority for manual execution while preserving trusted cron automation', () => {
    expect(route).toContain("const hasValidCronSecret = Boolean(CRON_SECRET && cronSecret === CRON_SECRET)");
    expect(route).toContain("hasPermission(session, 'pm_schedules.run')");
    expect(route).toContain("error: 'Insufficient permissions'");
    expect(route).toContain('hasValidCronSecret ? undefined : session?.userId');
  });

  it('limits manual generation to the caller plant scope', () => {
    expect(route).toContain('function manualAssetPlantFilter');
    expect(route).toContain('plantScope.accessiblePlantIds');
    expect(route).toContain('asset: manualAssetPlantFilter(plantScope)');
    expect(route).toContain("const DENY_ACCESS_SENTINEL = '__ACCESS_DENIED__'");
  });

  it('serializes each schedule before checking and creating its due-cycle work order', () => {
    expect(route).toContain('iassetspro:pm-due:${candidate.id}');
    expect(route).toContain("SELECT pg_advisory_xact_lock(hashtext($1))");
    expect(route).toContain('plannedStart: nextDueDate');
    expect(route).toContain("reason: 'WO already generated for this due cycle'");
  });

  it('serializes PM work-order number allocation and computes the numeric maximum safely', () => {
    expect(route).toContain('iassetspro:pm-wo-number:${prefix}');
    expect(route).toContain('const monthlyNumbers = await tx.workOrder.findMany');
    expect(route).toContain('Number.parseInt(row.woNumber.slice(prefix.length + 1), 10)');
    expect(route).toContain('String(highestNumber + 1).padStart(4, \'0\')');
  });

  it('commits the WO, component linkage, task comments and audit record atomically', () => {
    expect(route).toContain('const generation = await db.$transaction(async (tx) =>');
    expect(route).toContain('await tx.workOrder.create');
    expect(route).toContain('await tx.workOrderComponent.upsert');
    expect(route).toContain('await tx.workOrderComment.create');
    expect(route).toContain('await tx.auditLog.create');
  });

  it('does not fail a committed PM generation because notification delivery failed', () => {
    expect(route).toContain("console.error('[PM Check-Due Notification Error]', notificationError)");
  });
});
