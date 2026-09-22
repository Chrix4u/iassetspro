import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician resource session resilience', () => {
  it('keeps the one-time authenticated GET retry and synchronizes true expiry with the auth store', () => {
    const api = read('src/lib/api.ts');
    const authStore = read('src/stores/authStore.ts');

    expect(api).toContain('authRetryAttempt?: boolean');
    expect(api).toContain("normalizedMethod === 'GET'");
    expect(api).toContain('isSessionAuthFailure(endpoint, res.status, error)');
    expect(api).toContain('export function hasClientAuthToken');
    expect(api.indexOf('&& !hasClientAuthToken()')).toBeGreaterThan(
      api.indexOf('const offlineResponse = await queueOfflineMutationIfSupported'),
    );

    expect(authStore).toContain('AUTH_SESSION_EXPIRED_EVENT');
    expect(authStore).toContain('window.addEventListener(AUTH_SESSION_EXPIRED_EVENT');
    expect(authStore).toContain('isAuthenticated: false');
  });

  it('uses the WO payload as the personal-tool read baseline', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');

    expect(ui).toContain('const hydratePersonalToolsFromWO');
    expect(ui).toContain('const raw = workOrder?.personalTools');
    expect(ui).toContain('hydratePersonalToolsFromWO(res.data)');
    expect(ui).not.toContain('fetchPersonalTools');
    expect(ui).not.toContain('api.get<PersonalTool[]>(`/api/work-orders/${id}/personal-tools`)');
  });

  it('merges planner tools with the exact-WO live candidate directory', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    const technicianPanels = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(ui).toContain('const plannerRecommended = suggestedTools');
    expect(ui).toContain("['suggested', 'planned'].includes(tool.pipelineStatus)");
    expect(ui).toContain('/api/work-orders/${id}/tool-candidates?status=available&limit=100');
    expect(ui).toContain('Planner recommended');

    expect(technicianPanels).toContain('plannerToolOptionsFromWorkOrder');
    expect(technicianPanels).toContain('/api/work-orders/${workOrderId}/tool-candidates?status=available&limit=100');
    expect(technicianPanels).toContain('availabilityVerified');
  });

  it('keeps exact-WO execution authorization behind the candidate endpoint', () => {
    const candidates = read('src/app/api/work-orders/[id]/tool-candidates/route.ts');
    const plantAuth = read('src/lib/plant-auth-helpers.ts');

    expect(candidates).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(candidates).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(plantAuth).toContain('export async function authorizeWorkOrderExecutionAccess');
    expect(plantAuth).toContain('isWorkOrderExecutionMember(session, wo)');
  });
});
