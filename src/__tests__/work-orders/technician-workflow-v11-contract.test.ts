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

  it('keeps edit cancellation compact inside resource cards', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).not.toContain('Cancel Edit');
    expect(panel).toContain('className="shrink-0 whitespace-nowrap" onClick={resetMaterialRequest}');
    expect(panel).toContain('className="shrink-0 whitespace-nowrap" onClick={resetToolRequest}');
  });

  it('prefetches available store materials, tools and units instead of free-text resource identities', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain("api.get<InventoryOption[]>(`/api/work-orders/${workOrderId}/inventory-candidates?limit=100`, workOrderPlantHeaders)");
    expect(panel).toContain("api.get<ToolOption[]>(`/api/work-orders/${workOrderId}/tool-candidates?status=available&limit=100`, workOrderPlantHeaders)");
    expect(panel).toContain("{ headers: { 'X-Plant-ID': String(workOrder.plantId) } }");
    expect(panel).toContain("api.get<any[]>(`/api/work-orders/${workOrderId}/personal-tools`, workOrderPlantHeaders)");
    expect(panel).not.toContain("api.get<InventoryOption[]>('/api/inventory?mode=lookup");
    expect(panel).not.toContain("api.get<ToolOption[]>('/api/tools?mode=lookup");
    expect(panel).toContain('.filter((item) => Number(item.currentStock ?? 0) > 0)');
    expect(panel).toContain(".filter((tool) => tool.status === 'available' && Number(tool.quantity ?? 1) > 0)");
    expect(panel).toContain('selectedId={material.itemId}');
    expect(panel).toContain('itemId: selectedMaterial?.id || material.itemId');
    expect(panel).toContain("unit: selectedMaterial?.unitOfMeasure || material.unit || 'each'");
    expect(panel).toContain('readOnly placeholder="From inventory"');
    expect(panel).toContain('selectedId={toolRequest.toolId}');
    expect(panel).toContain('toolId: selectedTool?.id || toolRequest.toolId');
    expect(panel).toContain('quantityRequested: quantity');
  });

  it('separates planner recommendations from submitted resource requests', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('Planner Recommended Resources');
    expect(panel).toContain('They are not approval requests until you submit them.');
    expect(panel).toContain("action: 'submit_recommendations'");
    expect(panel).toContain('submitPlannerRecommendations');
    expect(panel).toContain('plannerMaterialRecommendations');
    expect(panel).toContain('plannerToolRecommendations');
    expect(panel).toContain('materialPipelineRequests');
    expect(panel).toContain('toolPipelineRequests');
    expect(panel).toContain('Planner recommendation');
    expect(panel).toContain('Submit recommendations');
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

  it('keeps live technician timing separate while allowing guarded team-leader retrospective labor entry', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain('`/api/work-orders/${workOrderId}/time-logs');
    expect(panel).toContain('Labor & Time History');
    expect(panel).toContain('capabilities?.canLogTeamTime && capabilities?.isTeamLeader');
    expect(panel).toContain("action: 'start'");
    expect(panel).toContain('loggedForUserId: teamTime.userId');
    expect(panel).toContain('isTeamLog: true');
    expect(panel).toContain('startTime: start.toISOString()');
    expect(panel).toContain('endTime: end.toISOString()');
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
