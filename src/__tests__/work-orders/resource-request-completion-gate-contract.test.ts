import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP resource request approval and completion gate contract', () => {
  it('blocks technician completion while material, tool, or assistance requests are unresolved', () => {
    const readiness = read('src/services/workOrderReadiness.service.ts');

    expect(readiness).toContain('PENDING_TOOL_REQUESTS');
    expect(readiness).toContain('unresolvedToolRequests');
    expect(readiness).toContain("['pending', 'supervisor_approved', 'storekeeper_approved'].includes(tr.status)");

    expect(readiness).toContain('PENDING_MATERIAL_REQUESTS');
    expect(readiness).toContain('unresolvedMaterialRequests');
    expect(readiness).toContain("if (mr.status !== 'closed') return true");
    expect(readiness).toContain('still require store verification and final reconciliation before completion');
    expect(readiness).toContain("['pending', 'supervisor_approved', 'storekeeper_approved'].includes(mr.status)");

    expect(readiness).toContain('PENDING_ASSISTANCE');
    expect(readiness).toContain('unresolvedAssistance');
    expect(readiness).toContain("if (req.status === 'pending') return true");
  });

  it('exposes the canonical completion readiness and disables submit while blockers remain', () => {
    const capabilities = read('src/app/api/work-orders/[id]/capabilities/route.ts');
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');

    expect(capabilities).toContain("await checkReadiness(id, 'complete')");
    expect(capabilities).toContain('completionReadiness');
    expect(page).toContain('const completionBlocked');
    expect(page).toContain('Resolve these items before submitting:');
    expect(page).toContain('!completionNotes.trim() || completionBlocked');
  });

  it('keeps cancellation limited to pending requests in both API and work-order UI', () => {
    const materialRoute = read('src/app/api/repairs/material-requests/[id]/route.ts');
    const toolRoute = read('src/app/api/repairs/tool-requests/[id]/route.ts');
    const assistanceRoute = read('src/app/api/work-orders/[id]/team-member-requests/[reqId]/route.ts');
    const technicianPage = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    const panels = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(materialRoute).toContain("existing.status !== 'pending'");
    expect(materialRoute).toContain("deleteMany({ where: { id, status: 'pending' } })");
    expect(toolRoute).toContain("toolReq.status !== 'pending'");
    expect(toolRoute).toContain("deleteMany({ where: { id, status: 'pending' } })");
    expect(assistanceRoute).toContain("teamRequest.status !== 'pending'");
    expect(technicianPage).toContain("const ownPending = request.status === 'pending'");
    expect(panels).toContain("request.status === 'pending'");
    expect(panels).toContain('cancelMaterialRequest(request.id)');
    expect(panels).toContain('cancelToolRequest(request.id)');
  });

  it('binds resource approvals to the accountable supervisor and plant-scoped store roles', () => {
    const materialRoute = read('src/app/api/repairs/material-requests/[id]/route.ts');
    const toolRoute = read('src/app/api/repairs/tool-requests/[id]/route.ts');

    for (const route of [materialRoute, toolRoute]) {
      expect(route).toContain('canReviewResourceRequestAsSupervisor');
      expect(route).toContain('workOrder.assignedSupervisorId');
      expect(route).toContain('isResourceStoreActor(session)');
      expect(route).toContain('RESOURCE_STORE_ROLE_SLUGS');
      expect(route).toContain('plantAccess: { some: { plantId:');
    }

    expect(materialRoute).toContain('matReq.plantId');
    expect(toolRoute).toContain('toolReq.plantId');
  });

  it('shows the requested trade to the planner, requires an assignee, and notifies the assigned technician through the normal notification/SMS pipeline', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    const assistanceRoute = read('src/app/api/work-orders/[id]/team-member-requests/[reqId]/route.ts');
    const toolCreateRoute = read('src/app/api/repairs/tool-requests/route.ts');
    const notifications = read('src/lib/notifications.ts');

    expect(maintenance).toContain('<strong>Trade needed:</strong> {req.requestedTrade}');
    expect(maintenance).toContain('/api/workers?role=technician');
    expect(maintenance).toContain('worker.skills');
    expect(maintenance).toContain('Only active technicians in this plant with the requested trade/skill are listed.');
    expect(maintenance).toContain("'Assign & Approve'");
    expect(assistanceRoute).toContain('Please select a technician to assign for this trade request.');
    expect(assistanceRoute).toContain("row.role.slug === 'maintenance_technician'");
    expect(assistanceRoute).toContain('Selected technician does not have the requested trade/skill');
    expect(assistanceRoute).toContain("'wo_team_approved'");
    expect(assistanceRoute).toContain("'Team Assignment Approved'");
    expect(toolCreateRoute).toContain("'New Tool Request Submitted'");
    expect(toolCreateRoute).toContain('wo.plannerId !== wo.assignedSupervisorId');
    expect(notifications).toContain("await import('@/lib/sms')");
    expect(notifications).toContain('await sendSms(phone, smsContent)');
  });
});
