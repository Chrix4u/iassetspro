import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import {
  closeRepairWorkOrder,
  type ClosureSessionContext,
  type ClosureAuditContext,
} from '@/services/workOrderClosure.service';
import { extractAuditContext } from '@/lib/audit-helpers';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

    if (!isAdmin(session) && !hasAnyPermission(session, ['work_orders.close'])) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to close work order' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json() as Record<string, unknown>;
    const auditCtx = extractAuditContext(request);

    const result = await closeRepairWorkOrder(
      id,
      session as ClosureSessionContext,
      {
        notes: optionalString(body.notes),
        componentId: optionalString(body.componentId),
        failureMode: optionalString(body.failureMode),
        failureCause: optionalString(body.failureCause),
        correctiveAction: optionalString(body.correctiveAction),
        pmRecommendation: optionalString(body.pmRecommendation),
        followUpRequired: typeof body.followUpRequired === 'boolean'
          ? body.followUpRequired
          : undefined,
        followUpNotes: optionalString(body.followUpNotes),
        auditCtx: auditCtx as ClosureAuditContext,
      },
    );

    if (!result.success) {
      const status = result.error === 'Work order not found'
        ? 404
        : result.conflict
          ? 409
          : result.readiness
            ? 422
            : 400;
      return NextResponse.json({
        success: false,
        error: result.error,
        ...(result.readiness
          ? { blockers: result.readiness.blockers, warnings: result.readiness.warnings }
          : {}),
      }, { status });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      ...(result.idempotent ? { idempotent: true } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to close work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
