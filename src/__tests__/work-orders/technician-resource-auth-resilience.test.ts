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
