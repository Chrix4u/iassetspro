import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import {
  placeWorkOrderInWaitingState,
  type ExecutionStateSessionContext,
  type ExecutionStateAuditContext,
} from '@/services/workOrderExecutionState.service';
import { extractAuditContext } from '@/lib/audit-helpers';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

/**
 * POST /api/work-orders/[id]/wait-parts
 *
 * Marks a work order as waiting for parts (in_progress → waiting_parts).
 * Used when required parts/materials are not in stock.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'work_orders.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const requiredParts = body.requiredParts;
    const reason = notes || 'Waiting for parts/materials';
    const waitingPartsNote = `[Waiting Parts] ${reason}${
      requiredParts ? ` | Parts: ${JSON.stringify(requiredParts)}` : ''
    }`;
    const auditCtx = extractAuditContext(request);

    const result = await placeWorkOrderInWaitingState(
      id,
      'waiting_parts',
      session as ExecutionStateSessionContext,
      {
        reason,
        // Role permission alone is not enough: the actor must be the assigned
        // technician/team leader, assigned planner, or maintenance-management
        // override. This prevents another technician in the same plant from
        // stopping someone else's WO and closing their team timers.
        requireExecutionAuthority: true,
        extraData: { notes: waitingPartsNote },
        auditCtx: auditCtx as ExecutionStateAuditContext,
      },
    );

    if (!result.success) {
      const status = result.error === 'Work order not found' ? 404 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    // Preserve the existing API response contract expected by Repairs UI callers.
    const updated = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update work order status';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
