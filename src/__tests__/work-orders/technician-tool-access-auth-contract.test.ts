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

  it('uses a backup same-origin token header when Authorization is stripped upstream', () => {
    const proxy = read('src/proxy.ts');
    const apiClient = read('src/lib/api.ts');

    expect(apiClient).toContain("headers['Authorization'] = `Bearer ${token}`");
    expect(apiClient).toContain("headers['X-EAM-Token'] = token");
    expect(proxy).toContain("request.headers.get('x-eam-token')");
    expect(proxy).toContain('const token = bearerToken || fallbackToken');
    expect(proxy).toContain("requestHeaders.set('authorization', \`Bearer \${token}\`)");
  });

  it('uses a work-order-scoped tool selector for assigned technicians', () => {
    const route = read('src/app/api/work-orders/[id]/tool-options/route.ts');
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    const proxy = read('src/proxy.ts');

    expect(proxy).toContain('/tool-options');
    expect(route).toContain('canViewWorkOrder(session, wo)');
    expect(route).toContain('const isExecutionActor');
    expect(route).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(route).toContain('if (!isExecutionActor) {');
    expect(route).toContain('authorizeWorkOrderPlant(request, session, id)');
    expect(route).toContain('plantId: wo.plantId');
    expect(route).toContain("status: 'available'");
    expect(route).toContain('recommendedTools');
    expect(route).toContain("where: { source: 'planner_suggested', status: 'pending' }");
    expect(route).toContain('const recommendationByToolId = new Map');
    expect(route).toContain('Recovered from planner recommendation');
    expect(route).toContain("currentStatus: current?.status || 'unavailable'");
    expect(panel).toContain('/api/work-orders/${workOrderId}/tool-options');
    expect(panel).toContain('plannerRecommended: true');
    expect(panel).toContain("'Planner recommendation · '");
    expect(panel).not.toContain("'/api/tools?mode=lookup&status=available&limit=100'");
  });

  it('allows exact WO execution actors to use contextual personal/tool-request access', () => {
    const personalTools = read('src/app/api/work-orders/[id]/personal-tools/route.ts');
    const toolRequests = read('src/app/api/repairs/tool-requests/route.ts');

    expect(personalTools).toContain('const isExecutionMember');
    expect(personalTools).toContain('if (!isExecutionMember) {');
    expect(personalTools).toContain('authorizeWorkOrderPlant(request, session, id)');
    expect(personalTools).toContain('const hasDirectWorkflowRelationship');

    expect(toolRequests).toContain('const isExecutionMember = Boolean(woTeam) || isAssignee || isTeamLeader');
    expect(toolRequests).toContain('if (!isExecutionMember) {');
    expect(toolRequests).toContain('getPlantScope(request, session)');
    expect(toolRequests).toContain('tool.plantId !== wo.plantId');
  });

  it('keeps planner-recommended tools visible even outside the available list', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('const recommendedTools = Array.isArray((toolsRes.data as any).recommendedTools)');
    expect(panel).toContain("name: tool.toolName || 'Planner-recommended tool'");
    expect(panel).toContain('mergedTools.set(tool.id');
    expect(panel).toContain("tool.plannerRecommended ? '★ ' : ''");
    expect(panel).toContain('if (selectedTool && !selectedTool.plannerRecommended)');
  });

  it('self-heals empty persisted RBAC snapshots for existing sessions', () => {
    const auth = read('src/lib/auth.ts');

    expect(auth).toContain('if (roles.length === 0 && permissions.length === 0)');
    expect(auth).toContain('rolePermissions');
    expect(auth).toContain('directPerms');
    expect(auth).toContain('permissions: JSON.stringify(permissions)');
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
