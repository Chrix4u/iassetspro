import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician workflow V1.1 completion contract', () => {
  it('uses a lifecycle-oriented full-page workspace', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(page).toContain('TechnicianWorkOrderV11Panels');
    expect(page).toContain('id="assignment"');
    expect(page).toContain('id="preparation"');
    expect(page).toContain('id="execution"');
    expect(page).toContain('id="evidence"');
    expect(page).toContain('id="completion"');
    for (const label of ['Assignment', 'Preparation', 'Execution', 'Resources', 'Evidence', 'Completion']) {
      expect(panel).toContain(`label: '${label}'`);
    }
    expect(panel).toContain('Sticky work order lifecycle navigation');
    expect(panel).toContain('absolute right-3 top-1/2');
    expect(panel).not.toContain('grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6');
    expect(panel).toContain('id="resources" className="scroll-mt-28 grid grid-cols-1 gap-5"');
    expect(panel).toContain('lg:grid-cols-[minmax(13rem,2.2fr)');
    expect(panel).toContain('lg:grid-cols-[minmax(14rem,2.2fr)');
  });

  it('integrates materials, tools and personal tools in the technician workspace', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain('`/api/work-orders/${workOrderId}/materials`');
    expect(panel).toContain("api.post('/api/repairs/tool-requests'");
    expect(panel).toContain('`/api/work-orders/${workOrderId}/personal-tools`');
    expect(panel).toContain('Materials — Request & Status');
    expect(panel).toContain('Tools — Request, Issue & Personal Tools');
  });

  it('prefetches available store materials, tools and units instead of free-text resource identities', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain("api.get<InventoryOption[]>('/api/inventory')");
    expect(panel).toContain("api.get<ToolOption[]>('/api/tools?status=available&limit=100')");
    expect(panel).toContain('.filter((item) => Number(item.currentStock ?? 0) > 0)');
    expect(panel).toContain(".filter((tool) => tool.status === 'available' && Number(tool.quantity ?? 1) > 0)");
    expect(panel).toContain('value={material.itemId}');
    expect(panel).toContain('itemId: selectedMaterial.id');
    expect(panel).toContain("unit: selectedMaterial.unitOfMeasure || 'each'");
    expect(panel).toContain('readOnly placeholder="From inventory"');
    expect(panel).toContain('value={toolRequest.toolId}');
    expect(panel).toContain('toolId: selectedTool.id');
    expect(panel).toContain('quantityRequested: quantity');
  });

  it('provides work-order-scoped downtime capture with authorization and audit', () => {
    const route = read('src/app/api/work-orders/[id]/downtime/route.ts');
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(route).toContain('authorizeWorkOrderPlant');
    expect(route).toContain('isExecutionMember');
    expect(route).toContain("buildAuditData('create', 'wo_downtime'");
    expect(route).toContain("buildAuditData('update', 'wo_downtime'");
    expect(route).toContain('workOrderDowntime.create');
    expect(route).toContain('workOrderDowntime.update');
    expect(route).toContain('ACTIVE_DOWNTIME_STATUSES');
    expect(route).toContain('An ongoing downtime record already exists');
    expect(panel).toContain('`/api/work-orders/${workOrderId}/downtime`');
    expect(panel).toContain('Start Downtime');
    expect(panel).toContain('End Downtime');
  });

  it('embeds labor history without reviving stale live /time-logs writes', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain('`/api/work-orders/${workOrderId}/time-logs');
    expect(panel).toContain('Labor & Time History');
    expect(panel).not.toContain('api.post(`/api/work-orders/${workOrderId}/time-logs`');
    expect(panel).not.toContain('api.patch(`/api/work-orders/${workOrderId}/time-logs`');
  });

  it('keeps tool request UI aligned with endpoint permission and exposes downtime capability', () => {
    const caps = read('src/app/api/work-orders/[id]/capabilities/route.ts');
    expect(caps).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(caps).toContain('canCreateToolRequest');
    expect(caps).toContain('canManageDowntime');
    expect(caps).toContain('canLogDowntime: activeExecutionStatuses.includes(wo.status)');
  });

  it('blocks completion while equipment downtime is still open and keeps stage anchors permanent', () => {
    const readiness = read('src/services/workOrderReadiness.service.ts');
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    expect(readiness).toContain('ONGOING_DOWNTIME');
    expect(readiness).toContain('workOrderDowntimes');
    expect(page).toContain('<div id="assignment" className="scroll-mt-28" aria-hidden="true" />');
    expect(page).toContain('<div id="completion" className="scroll-mt-28" aria-hidden="true" />');
  });
});
