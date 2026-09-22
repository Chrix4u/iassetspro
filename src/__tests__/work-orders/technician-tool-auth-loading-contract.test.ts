import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician tool loading and client auth boundary', () => {
  it('expires the client session only on true 401 authentication failures', () => {
    const api = read('src/lib/api.ts');
    const authStore = read('src/stores/authStore.ts');

    expect(api).toContain('return status === 401;');
    expect(api).toContain('403 is an authorization or scope denial');
    expect(api).toContain('export function hasClientAuthToken');
    expect(authStore).toContain('AUTH_SESSION_EXPIRED_EVENT');
    expect(authStore).toContain('window.addEventListener(AUTH_SESSION_EXPIRED_EVENT');
    expect(authStore).toContain('isAuthenticated: false');
  });

  it('hydrates personal tools from the already-authorized WO payload instead of a second GET', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');

    expect(ui).toContain('const hydratePersonalToolsFromWO');
    expect(ui).toContain('const raw = workOrder?.personalTools');
    expect(ui).toContain('hydratePersonalToolsFromWO(res.data)');
    expect(ui).not.toContain('fetchPersonalTools');
    expect(ui).not.toContain('api.get<PersonalTool[]>(`/api/work-orders/${id}/personal-tools`)');
  });

  it('keeps planner-recommended tools selectable even when the live tool directory is unavailable', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');

    expect(ui).toContain('const plannerRecommended = suggestedTools');
    expect(ui).toContain("['suggested', 'planned'].includes(tool.pipelineStatus)");
    expect(ui).toContain("if (hasClientAuthToken())");
    expect(ui).toContain("/api/tools?mode=lookup&status=available&limit=100");
    expect(ui).toContain("Planner recommended");
    expect(ui).toContain('toolsLookupCache.current = options.map');
  });

  it('keeps technician permissions compatible with tool lookup and request creation', () => {
    const toolsRoute = read('src/app/api/tools/route.ts');
    const seed = read('prisma/seed.ts');

    expect(toolsRoute).toContain("hasPermission(session, 'tools.view')");
    expect(toolsRoute).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(seed).toContain("maintenance_technician: [");
    expect(seed).toContain("'tools.view', 'tools.checkout', 'tools.return'");
    expect(seed).toContain("'repair_tool_requests.view_own', 'repair_tool_requests.create'");
  });
});
