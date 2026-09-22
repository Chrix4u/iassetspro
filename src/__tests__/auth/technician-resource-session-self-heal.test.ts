import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician resource session self-heal', () => {
  it('provides a DB-backed request session resolver', () => {
    const auth = read('src/lib/auth.ts');

    expect(auth).toContain('export async function getRequestSession(request: Request)');
    expect(auth).toContain("request.headers.get('authorization')");
    expect(auth).toContain('return getSessionAsync(token)');
    expect(auth).toContain('const session = await getRequestSession(request)');
  });

  it('uses the async resolver for technician resource endpoints', () => {
    const routes = [
      'src/app/api/tools/route.ts',
      'src/app/api/inventory/route.ts',
      'src/app/api/work-orders/[id]/personal-tools/route.ts',
      'src/app/api/work-orders/[id]/suggested-items/route.ts',
    ];

    for (const route of routes) {
      const source = read(route);
      expect(source).toContain('getRequestSession');
      expect(source).toContain('await getRequestSession(request)');
      expect(source).not.toContain('const session = getSession(request)');
    }
  });

  it('revalidates and retries once before clearing a valid bearer token', () => {
    const api = read('src/lib/api.ts');

    expect(api).toContain('_sessionRecoveryAttempted');
    expect(api).toContain("endpoint.split('?')[0] !== '/api/auth/me'");
    expect(api).toContain("'/api/auth/me'");
    expect(api).toContain('if (probe.success)');
    expect(api).toContain('_sessionRecoveryAttempted: true');
    expect(api).toContain('notifySessionExpired(endpoint, res.status, error)');
  });

  it('keeps technician lookup permissions on tools and inventory', () => {
    const tools = read('src/app/api/tools/route.ts');
    const inventory = read('src/app/api/inventory/route.ts');

    expect(tools).toContain("'tools.view'");
    expect(tools).toContain("'repair_tool_requests.create'");
    expect(inventory).toContain("'repair_material_requests.create'");
  });

  it('keeps planner-selected resources on the suggested-items read path', () => {
    const suggested = read('src/app/api/work-orders/[id]/suggested-items/route.ts');
    const planning = read('src/services/repairPlanning.service.ts');

    expect(suggested).toContain('suggestedTools: true');
    expect(suggested).toContain('suggestedParts: true');
    expect(planning).toContain('recommendedById: session.userId');
    expect(planning).not.toContain('await tx.repairToolRequest.create');
    expect(planning).not.toContain('await tx.repairMaterialRequest.create');
  });
});
