import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { extractAuditContext } from '@/lib/audit-helpers';
import {
  submitRepairCompletion,
  type CompletionSessionContext,
  type CompletionAuditContext,
} from '@/services/workOrderCompletion.service';
import {
  verifyRepairWorkOrder,
  type VerificationSessionContext,
  type VerificationAuditContext,
} from '@/services/workOrderVerification.service';
import {
  requestRepairRework,
  type ReworkSessionContext,
  type ReworkAuditContext,
} from '@/services/workOrderRework.service';
import {
  closeRepairWorkOrder,
  type ClosureSessionContext,
  type ClosureAuditContext,
} from '@/services/workOrderClosure.service';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// GET /api/repairs/completion/[workOrderId]
export async function GET(request: NextRequest, { params }: { params: Promise<{ workOrderId: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { workOrderId } = await params;

    // Plant authorization
    const plantAuth = await authorizeWorkOrderPlant(request, session, workOrderId);
    if (!plantAuth.ok) return plantAuth.response;

    const completion = await db.repairCompletion.findUnique({
      where: { workOrderId },
      include: {
        supervisorApprovedBy: { select: { id: true, fullName: true } },
        plannerClosedBy: { select: { id: true, fullName: true } },
        workOrder: {
          select: {
            id: true,
            woNumber: true,
            title: true,
            status: true,
            isLocked: true,
            assetId: true,
            assetId: true,
            lockReason: true,
            locker: { select: { id: true, fullName: true } },
            assignedTo: true,
            assignedSupervisorId: true,
            plannerId: true,
            teamLeaderId: true,
            assignedSupervisor: { select: { id: true, fullName: true } },
            planner: { select: { id: true, fullName: true } },
            assignee: { select: { id: true, fullName: true, avatar: true } },
            teamMembers: { select: { userId: true, role: true } },
          },
        },
      },
    });

    if (!completion) return NextResponse.json({ success: false, error: 'Completion record not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: completion });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load completion record';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/completion/[workOrderId] — compatibility boundary
// This legacy route delegates every mutation to the canonical RWOP lifecycle
// services. It intentionally does not trust client-supplied hours/cost totals.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { workOrderId } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, workOrderId);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json() as Record<string, unknown>;
    const action = optionalString(body.action) || 'submit';
    const auditCtx = extractAuditContext(request);

    if (action === 'submit') {
      if (!hasPermission(session, 'work_orders.complete') && !isAdmin(session)) {
        return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
      }

      const result = await submitRepairCompletion(
        workOrderId,
        session as CompletionSessionContext,
        {
          notes: optionalString(body.completionNotes),
          failureDescription: optionalString(body.findings),
          causeDescription: optionalString(body.rootCause),
          actionDescription: optionalString(body.correctiveAction),
          auditCtx: auditCtx as CompletionAuditContext,
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
    }

    if (action === 'supervisor_approve') {
      if (!hasPermission(session, 'work_orders.verify') && !isAdmin(session)) {
        return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
      }

      const result = await verifyRepairWorkOrder(
        workOrderId,
        session as VerificationSessionContext,
        {
          notes: optionalString(body.supervisorReviewNotes) || optionalString(body.completionNotes),
          auditCtx: auditCtx as VerificationAuditContext,
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
    }

    if (action === 'supervisor_request_rework') {
      if (!hasPermission(session, 'work_orders.verify') && !isAdmin(session)) {
        return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
      }

      const result = await requestRepairRework(
        workOrderId,
        session as ReworkSessionContext,
        {
          reason: optionalString(body.reworkReason) || '',
          notes: optionalString(body.supervisorReviewNotes),
          auditCtx: auditCtx as ReworkAuditContext,
        },
      );

      if (!result.success) {
        const status = result.error === 'Work order not found' ? 404 : 400;
        return NextResponse.json({ success: false, error: result.error }, { status });
      }

      return NextResponse.json({ success: true, data: result.data });
    }

    if (action === 'planner_close') {
      if (!hasPermission(session, 'work_orders.close') && !isAdmin(session)) {
        return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
      }

      const result = await closeRepairWorkOrder(
        workOrderId,
        session as ClosureSessionContext,
        {
          notes: optionalString(body.closureNotes),
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
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process completion action';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
