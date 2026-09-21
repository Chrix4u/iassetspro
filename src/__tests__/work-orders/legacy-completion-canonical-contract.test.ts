import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('legacy Repairs completion compatibility boundary', () => {
  const route = read('src/app/api/repairs/completion/[workOrderId]/route.ts');
  const page = read('src/components/modules/RepairsPagesLegacy.tsx');

  it('delegates lifecycle mutations to the canonical RWOP services', () => {
    expect(route).toContain('submitRepairCompletion');
    expect(route).toContain('verifyRepairWorkOrder');
    expect(route).toContain('requestRepairRework');
    expect(route).toContain('closeRepairWorkOrder');
    expect(route).toContain('authorizeWorkOrderPlant(request, session, workOrderId)');
    expect(route).toContain('extractAuditContext(request)');
    expect(route).not.toContain("import { executeTransition } from '@/lib/state-machine'");
    expect(route).not.toContain("import { checkReadiness } from '@/services/workOrderReadiness.service'");
  });

  it('keeps lifecycle permissions explicit at the compatibility route', () => {
    expect(route).toContain("hasPermission(session, 'work_orders.complete')");
    expect(route).toContain("hasPermission(session, 'work_orders.verify')");
    expect(route).toContain("hasPermission(session, 'work_orders.close')");
  });

  it('does not trust client-supplied hours or cost totals', () => {
    expect(route).not.toContain('body.totalLaborHours');
    expect(route).not.toContain('body.totalMaterialCost');
    expect(route).not.toContain('body.totalToolCost');
    expect(route).not.toContain('body.totalDowntimeMinutes');
    expect(page).not.toContain('totalLaborHours: form.totalLaborHours');
    expect(page).not.toContain('totalMaterialCost: form.totalMaterialCost');
    expect(page).not.toContain('totalToolCost: form.totalToolCost');
    expect(page).not.toContain('totalDowntimeMinutes: form.totalDowntimeMinutes');
    expect(page).toContain('calculated automatically from approved time logs');
  });

  it('allows first submission through a draft view without bypassing WO visibility', () => {
    expect(route).toContain('canViewWorkOrder(session, workOrder)');
    expect(route).toContain("id: `draft:${workOrderId}`");
    expect(route).toContain("supervisorStatus: 'pending_review'");
    expect(route).toContain("plannerStatus: 'pending_closure'");
    expect(route).toContain("['completed', 'verified', 'closed'].includes(workOrder.status)");
    expect(route).toContain('canonical completion snapshot is missing');
  });

  it('returns the work-order asset context used by the legacy component selector', () => {
    expect(route).toContain('assetId: true');
    expect(page).toContain('completion?.workOrder?.assetId');
  });
});
