import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician tool access and active-session scope', () => {
  it('keeps active sessions sliding while preserving an absolute cap', () => {
    const auth = read('src/lib/auth.ts');

    expect(auth).toContain('SESSION_TTL_MS = 24 * 60 * 60 * 1000');
    expect(auth).toContain('ABSOLUTE_SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000');
    expect(auth).toContain('cached.cachedAt = now');
    expect(auth).toContain('updateLastSeen(token, cached.data.createdAt)');
    expect(auth).toContain('updateLastSeen(token, dbSession.createdAt)');
    expect(auth).toContain('data: { lastSeen: now, expiresAt }');
    expect(auth).toContain('Math.min(idleExpiryMs, absoluteExpiryMs)');
  });

  it('uses an exact-WO tool lookup instead of the broad Tool Registry endpoint', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    const route = read('src/app/api/work-orders/[id]/tool-options/route.ts');
    const proxy = read('src/proxy.ts');

    expect(panel).toContain('/api/work-orders/${workOrderId}/tool-options');
    expect(panel).not.toContain('/api/tools?mode=lookup&status=available&limit=100');

    expect(route).toContain('authorizeWorkOrderPlant(request, session, id)');
    expect(route).toContain('canViewWorkOrder(session, wo)');
    expect(route).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(route).toContain('plantId: wo.plantId');
    expect(route).toContain('suggestedTools: true');
    expect(route).toContain('recommended: recommendedIds.has(tool.id)');
    expect(route).toContain('requestable: tool.status === \'available\'');

    expect(proxy).toContain('/^\\/api\\/work-orders\\/[^/]+\\/tool-options');
    expect(proxy).toContain("return ['work_orders', 'repairs', 'tools']");
  });

  it('prefills an available planner-recommended tool without overwriting technician edits', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('const plannerRecommended = requestableTools.find((tool) => tool.recommended)');
    expect(panel).toContain('setToolRequest((current) => current.toolId ? current :');
    expect(panel).toContain("toolId: plannerRecommended.id");
    expect(panel).toContain("Planner recommended · ");
    expect(panel).toContain("tool.requestable !== false");
  });
});
