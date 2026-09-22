import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician tool access authentication contract', () => {
  it('forwards a verified session snapshot from proxy to route workers', () => {
    const proxy = read('src/proxy.ts');
    const auth = read('src/lib/auth.ts');

    expect(proxy).toContain("requestHeaders.set('x-session-verified', '1')");
    expect(proxy).toContain("requestHeaders.set('x-session-permissions', session.permissions.join(','))");
    expect(proxy).toContain("requestHeaders.set('x-session-created-at', session.createdAt.toISOString())");

    expect(auth).toContain("request.headers.get('x-session-verified') !== '1'");
    expect(auth).toContain("request.headers.get('x-session-user-id')");
    expect(auth).toContain("request.headers.get('x-session-permissions')");
    expect(auth).toContain("sessionCache.set(token, { data: forwardedSession");
  });

  it('self-heals empty persisted RBAC snapshots for existing sessions', () => {
    const auth = read('src/lib/auth.ts');

    expect(auth).toContain('if (roles.length === 0 && permissions.length === 0)');
    expect(auth).toContain('rolePermissions');
    expect(auth).toContain('directPerms');
    expect(auth).toContain('permissions: JSON.stringify(permissions)');
  });

  it('does not fire V11 resource lookups without a persisted bearer session', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain("useAuthStore((s) => s.isAuthenticated)");
    expect(panel).toContain("useAuthStore((s) => s.user)");
    expect(panel).toContain("window.localStorage.getItem('eam_token')");
    expect(panel).toContain('if (!isAuthenticated || !user?.id || !tokenPresent)');
    expect(panel).toContain('void fetchMe();');
    expect(panel.indexOf("window.localStorage.getItem('eam_token')"))
      .toBeLessThan(panel.indexOf("/api/work-orders/${workOrderId}/personal-tools"));
    expect(panel.indexOf("window.localStorage.getItem('eam_token')"))
      .toBeLessThan(panel.indexOf("'/api/tools?mode=lookup&status=available&limit=100'"));
  });

  it('keeps planner-recommended tools selectable when live tool lookup fails', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('function plannerToolOptionsFromWorkOrder');
    expect(panel).toContain('parseStoredArray(workOrder?.suggestedTools)');
    expect(panel).toContain("request?.source !== 'planner_suggested'");
    expect(panel).toContain('setToolOptions(plannerToolFallbacks)');
    expect(panel).toContain('mergeToolOptions(plannerToolFallbacks, liveAvailableTools)');
    expect(panel).toContain('availabilityVerified: false');
    expect(panel).toContain('availabilityVerified: true');
    expect(panel).toContain('Planner recommended · availability will be verified on submit');
    expect(panel).toContain('Planner recommended · availability verified on submit');
    expect(panel).toContain('if (selectedTool?.availabilityVerified)');
    expect(panel).toContain('max={selectedTool?.availabilityVerified ? Number(selectedTool.quantity ?? 1) : undefined}');
    expect(panel).toContain('setPersonalTools(personalToolFallbacks)');
  });

  it('keeps technician tool lookup constrained to execution permissions', () => {
    const tools = read('src/app/api/tools/route.ts');
    const seed = read('prisma/seed-permissions-only.ts');
    const capabilities = read('src/app/api/work-orders/[id]/capabilities/route.ts');

    expect(tools).toContain("'repair_tool_requests.create'");
    expect(tools).toContain("const isLookup = mode === 'lookup'");
    expect(seed).toContain("'repair_tool_requests.view_own', 'repair_tool_requests.create'");
    expect(capabilities).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(capabilities).toContain('canRequestTools: canCreateToolRequest');
  });
});
