import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { extractAuditContext } from '@/lib/audit-helpers';
import {
  cancelRepairWorkOrder,
  type CancellationSessionContext,
  type CancellationAuditContext,
} from '@/services/workOrderCancellation.service';

/**
 * POST /api/work-orders/[id]/cancel
 *
 * Cancels a work order through the canonical cancellation service. The service
 * owns transition, event-log, audit and notification side effects atomically.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    if (!hasPermission(session, 'work_orders.cancel') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const auditCtx = extractAuditContext(request);
    const result = await cancelRepairWorkOrder(
      id,
      session as CancellationSessionContext,
      {
        reason: typeof body.reason === 'string' ? body.reason : '',
        auditCtx: auditCtx as CancellationAuditContext,
      },
    );

    if (!result.success) {
      const status = result.error === 'Work order not found' ? 404 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    // Preserve the existing Repairs UI response contract.
    const updated = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
