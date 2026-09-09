import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import {
  resumeWaitingWorkOrder,
  type ExecutionStateSessionContext,
  type ExecutionStateAuditContext,
} from '@/services/workOrderExecutionState.service';
import { extractAuditContext } from '@/lib/audit-helpers';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

function resolveResumeReason(body: Record<string, unknown>): string | undefined {
  // `reason` is canonical; `notes` remains supported for existing clients.
  const candidates = [body.reason, body.notes];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    if (!hasPermission(session, 'work_orders.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const auditCtx = extractAuditContext(request);

    const result = await resumeWaitingWorkOrder(
      id,
      session as ExecutionStateSessionContext,
      {
        reason: resolveResumeReason(body),
        auditCtx: auditCtx as ExecutionStateAuditContext,
      },
    );

    if (!result.success) {
      const status = result.conflict
        ? 409
        : result.error === 'Work order not found'
          ? 404
          : 400;
      return NextResponse.json({
        success: false,
        error: result.error,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.conflict ? { conflict: result.conflict } : {}),
      }, { status });
    }

    const data = result.data
      ? {
          ...result.data,
          // Make the labor/control distinction explicit for every client. A
          // supervisor/planner/manager release changes WO state only; the
          // assigned technician must explicitly open the next execution timer.
          technicianExecutionStartRequired: !result.data.executionSessionOpened,
        }
      : result.data;

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resume work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
