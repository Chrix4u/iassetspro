import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { extractAuditContext } from '@/lib/audit-helpers';
import {
  placeWorkOrderInWaitingState,
  resumeWaitingWorkOrder,
  type ExecutionStateSessionContext,
  type WaitingWorkOrderStatus,
} from '@/services/workOrderExecutionState.service';

const TECHNICIAN_WAITING_STATUSES = new Set<WaitingWorkOrderStatus>([
  'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit',
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['work_orders.start', 'work_orders.update']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    const auditCtx = extractAuditContext(request);

    if (action === 'resume') {
      const result = await resumeWaitingWorkOrder(id, session as ExecutionStateSessionContext, {
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        auditCtx,
      });
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error, ...(result.conflict ? { conflict: result.conflict } : {}) }, { status: result.conflict ? 409 : 400 });
      }
      return NextResponse.json({ success: true, data: result.data });
    }

    if (action !== 'wait' || typeof body.targetStatus !== 'string' || !TECHNICIAN_WAITING_STATUSES.has(body.targetStatus as WaitingWorkOrderStatus)) {
      return NextResponse.json({ success: false, error: 'Provide action=wait with a valid technician waiting status, or action=resume' }, { status: 400 });
    }

    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined;

    const result = await placeWorkOrderInWaitingState(
      id,
      body.targetStatus as WaitingWorkOrderStatus,
      session as ExecutionStateSessionContext,
      { reason, requireExecutionAuthority: true, auditCtx },
    );
    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to change execution state';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
