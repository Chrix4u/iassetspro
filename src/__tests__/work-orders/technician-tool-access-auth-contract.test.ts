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
      .toBeLessThan(panel.indexOf("/api/work-orders/${workOrderId}/tool-options"));
  });

  it('keeps planner-recommended tools selectable when live tool lookup fails', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('function plannerToolOptionsFromWorkOrder');
    expect(panel).toContain('parseStoredArray(workOrder?.suggestedTools)');
    expect(panel).toContain("request?.source !== 'planner_suggested'");
    expect(panel).toContain('setToolOptions(plannerToolFallbacks)');
    expect(panel).toContain('/api/work-orders/${workOrderId}/tool-options');
    expect(panel).toContain('serverRecommendations');
    expect(panel).toContain('plannerRecommended: true');
    expect(panel).toContain('availabilityVerified: false');
    expect(panel).toContain('availabilityVerified: true');
    expect(panel).toContain('Planner recommendation · availability will be verified on submit');
    expect(panel).toContain('Planner recommendation · availability verified on submit');
    expect(panel).toContain('if (selectedTool?.availabilityVerified && !selectedTool.plannerRecommended)');
    expect(panel).toContain('max={selectedTool?.availabilityVerified && !selectedTool.plannerRecommended ? Number(selectedTool.quantity ?? 1) : undefined}');
    expect(panel).toContain('setPersonalTools(personalToolFallbacks)');
  });

  it('uses an exact-work-order tool selector and relationship-scoped personal tools', () => {
    const toolOptions = read('src/app/api/work-orders/[id]/tool-options/route.ts');
    const personalTools = read('src/app/api/work-orders/[id]/personal-tools/route.ts');
    const proxy = read('src/proxy.ts');

    expect(toolOptions).toContain('canViewWorkOrder(session, wo)');
    expect(toolOptions).toContain('const isExecutionActor');
    expect(toolOptions).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(toolOptions).toContain("status: 'available'");
    expect(toolOptions).toContain('recommendedTools');
    expect(toolOptions).toContain('currentQuantity');
    expect(toolOptions).toContain('authorizeWorkOrderPlant(request, session, id)');
    expect(personalTools).toContain('const isExecutionMember');
    expect(personalTools).toContain('if (!isExecutionMember)');
    expect(proxy).toContain('/tool-options');
  });

  it('keeps tool-request submission WO-scoped for assigned execution actors', () => {
    const requests = read('src/app/api/repairs/tool-requests/route.ts');

    expect(requests).toContain('let canViewWorkOrderExecutionScope = false');
    expect(requests).toContain('if (!canViewWorkOrderExecutionScope)');
    expect(requests).toContain('const isExecutionActor = Boolean(woTeam) || isAssignee');
    expect(requests).toContain('if (!isExecutionActor && !isAdmin(session))');
    expect(requests).toContain('if (!isExecutionActor) {');
    expect(requests).toContain("tool.plantId !== wo.plantId");
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
