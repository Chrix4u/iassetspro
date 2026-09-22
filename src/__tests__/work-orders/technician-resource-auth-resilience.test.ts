import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician resource auth resilience', () => {
  it('retries an idempotent protected GET once before clearing a persisted session', () => {
    const api = read('src/lib/api.ts');

    expect(api).toContain('authRetryAttempt?: boolean');
    expect(api).toContain("localStorage.getItem('eam_token')");
    expect(api).toContain("normalizedMethod === 'GET'");
    expect(api).toContain('isSessionAuthFailure(endpoint, res.status, error)');
    expect(api).toContain('authRetryAttempt: true');
  });

  it('never fires auxiliary technician resource reads after the bearer disappears', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain("useAuthStore((state) => state.isAuthenticated)");
    expect(panel).toContain("useAuthStore((state) => state.user)");
    expect(panel).toContain("window.localStorage.getItem('eam_token')");
    expect(panel).toContain('if (!isAuthenticated || !user?.id || !tokenPresent)');
    expect(panel).toContain('void fetchMe()');
  });

  it('guards the legacy WO detail personal-tool read with the persisted bearer', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');

    expect(maintenance).toContain('isAuthenticated, fetchMe');
    expect(maintenance).toContain("window.localStorage.getItem('eam_token')");
    expect(maintenance).toContain('if (!isAuthenticated || !user?.id || !toolResourcesEnabled || !tokenPresent)');
    expect(maintenance).toContain('if (isAuthenticated && user?.id && !tokenPresent) void fetchMe()');
  });

  it('falls back to planner-recommended tools when live WO candidate lookup cannot authenticate', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    const anchor = maintenance.indexOf('toolsLookupCache.current');
    expect(anchor).toBeGreaterThan(-1);
    const slice = maintenance.slice(Math.max(0, anchor - 2500), anchor + 5500);

    expect(slice).toContain('const plannerFallbacks = suggestedTools');
    expect(slice).toContain("window.localStorage.getItem('eam_token')");
    expect(slice).toContain('toolsLookupCache.current = plannerFallbacks');
    expect(slice).toContain('return fallbackOptions');
    expect(slice).toContain('Planner recommendation · availability pending');
    expect(slice).toContain('/api/work-orders/${id}/tool-candidates?status=available&limit=100');
  });

  it('keeps planner-selected tools visible if live candidate lookup cannot run', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('function plannerToolOptionsFromWorkOrder');
    expect(panel).toContain('workOrder?.suggestedTools');
    expect(panel).toContain('workOrder?.repairToolRequests');
    expect(panel).toContain('setToolOptions(plannerToolFallbacks)');
    expect(panel).toContain("plannerRecommended: true");
    expect(panel).toContain('availabilityVerified: false');
    expect(panel).toContain('Planner recommendation · availability pending');
  });

  it('uses exact-WO candidate endpoints rather than broad registries', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('/api/work-orders/${workOrderId}/tool-candidates?status=available&limit=100');
    expect(panel).toContain('/api/work-orders/${workOrderId}/inventory-candidates?limit=100');
    expect(panel).not.toContain('/api/tools?mode=lookup&status=available&limit=100');
  });
});
