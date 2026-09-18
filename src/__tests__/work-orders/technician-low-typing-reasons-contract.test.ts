import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician low-typing reason contract', () => {
  it('does not block technician resource requests on typed reasons', () => {
    const panels = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panels).not.toContain("material.reason.trim().length < 3");
    expect(panels).not.toContain("toolRequest.reason.trim().length < 3");
    expect(panels).not.toContain("downtimeForm.reason.trim().length < 3");
    expect(panels).not.toContain('<Label>Reason *</Label>');
    expect(panels).not.toContain('<Label>Downtime reason *</Label>');

    expect(panels).toContain('materialRequestReason({');
    expect(panels).toContain('toolRequestReason({');
    expect(panels).toContain('downtimeReason({');
    expect(panels).not.toContain('(optional — auto-generated)');
  });

  it('does not block assistance, waiting, handover, pause, or decline on typed reasons', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');

    expect(page).not.toContain("assistanceReason.trim().length < 3");
    expect(page).not.toContain("waitingReason.trim().length < 3");
    expect(page).not.toContain("handoverReason.trim().length < 3");
    expect(page).not.toContain("declineReason.trim().length < 5");
    expect(page).toContain('assistanceRequestReason({');
    expect(page).toContain('waitingStateReason({');
    expect(page).toContain('buildHandoverReason({');
    expect(page).toContain('buildPauseReason({');
    expect(page).toContain('assignmentDeclineReason({');
  });

  it('keeps API audit reasons populated when clients omit free text', () => {
    const toolRoute = read('src/app/api/repairs/tool-requests/route.ts');
    const materialRoute = read('src/app/api/repairs/material-requests/route.ts');
    const woMaterialRoute = read('src/app/api/work-orders/[id]/materials/route.ts');
    const assistanceRoute = read('src/app/api/work-orders/[id]/team-member-requests/route.ts');
    const assistanceEdit = read('src/app/api/work-orders/[id]/team-member-requests/[reqId]/route.ts');
    const executionState = read('src/services/workOrderExecutionState.service.ts');
    const handover = read('src/services/workOrderHandoverInitiation.service.ts');
    const assignment = read('src/services/workOrderAssignmentResponse.service.ts');
    const downtime = read('src/app/api/work-orders/[id]/downtime/route.ts');

    expect(toolRoute).not.toContain('workOrderId and reason are required');
    expect(toolRoute).toContain('toolRequestReason({');
    expect(materialRoute).not.toContain('and reason are required');
    expect(materialRoute).toContain('materialRequestReason({');
    expect(woMaterialRoute).toContain('materialRequestReason({');
    expect(assistanceRoute).toContain('assistanceRequestReason({');
    expect(assistanceEdit).not.toContain("reason is required");
    expect(executionState).not.toContain("if (!reason) return { success: false, error: 'A reason is required' }");
    expect(executionState).toContain('waitingStateReason({');
    expect(handover).toContain('handoverReason({');
    expect(assignment).not.toContain('A clear decline reason of at least 5 characters is required');
    expect(assignment).toContain('assignmentDeclineReason({');
    expect(downtime).not.toContain('Downtime reason must be at least 3 characters');
    expect(downtime).toContain('downtimeReason({');
  });
});
