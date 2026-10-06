import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const cron = fs.readFileSync('src/app/api/pm-schedules/check-due-cron/route.ts', 'utf8');

describe('PM cron generation delegation contract', () => {
  it('delegates work-order generation to the canonical atomic endpoint', () => {
    expect(cron).toContain("POST as generateDueWorkOrders");
    expect(cron).toContain('generateDueWorkOrders(request)');
    expect(cron).not.toContain('generateWoNumber');
    expect(cron).not.toContain('db.workOrder.create');
    expect(cron).not.toContain('db.workOrderComponent.upsert');
  });

  it('requires PM run authority for manual execution while preserving trusted cron', () => {
    expect(cron).toContain("request.headers.get('x-pm-cron-secret')");
    expect(cron).toContain("hasPermission(session, 'pm_schedules.run')");
    expect(cron).toContain('hasValidCronSecret');
    expect(cron).toContain("error: 'Insufficient permissions'");
  });

  it('restricts the manual overdue scan to the caller plant boundary', () => {
    expect(cron).toContain('getPlantScope(request, session)');
    expect(cron).toContain('asset: manualAssetPlantFilter(plantScope)');
    expect(cron).toContain('DENY_ACCESS_SENTINEL');
  });

  it('does not turn notification delivery failure into a generation retry', () => {
    expect(cron).toContain("console.error('[PM Overdue Notification Error]'");
    expect(cron).toContain('Notification delivery is secondary');
  });
});
