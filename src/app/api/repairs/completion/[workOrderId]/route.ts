import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasRole } from '@/lib/auth';
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

const completionInclude = {
  supervisorApprovedBy: { select: { id: true, fullName: true } },
  plannerClosedBy: { select: { id: true, fullName: true } },
  workOrder: {
    select: {
      id: true,
      woNumber: true,
      title: true,
      status: true,
      isLocked: true,
      lockReason: true,
      locker: { select: { id: true, fullName: true } },
      assignedSupervisor: { select: { id: true, fullName: true } },
      planner: { select: { id: true, fullName: true } },
      assignee: { select: { id: true, fullName: true, avatar: true } },
    },
  },
} as const;

async function loadCompletion(workOrderId: string) {
  return db.repairCompletion.findUnique({
    where: { workOrderId },
    include: completionInclude,
  });
}

// GET /api/repairs/completion/[workOrderId]
export async function GET(
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

    const completion = await loadCompletion(workOrderId);
    if (!completion) {
      return NextResponse.json(
        { success: false, error: 'Completion record not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: completion });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load completion record';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/completion/[workOrderId]
//
// Compatibility adapter for the legacy Repairs UI. Lifecycle mutation belongs
// to the canonical WorkOrder orchestration services; this route must never call
// executeTransition or write WorkOrder status/cost/lock fields directly.
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
    const body = await request.json();
    const action = body.action as string | undefined;

    const plantAuth = await authorizeWorkOrderPlant(request, session, workOrderId);
    if (!plantAuth.ok) return plantAuth.response;

    if (action === 'supervisor_approve' || action === 'supervisor_request_rework') {
      if (
        !isAdmin(session) &&
        !hasRole(session, 'maintenance_supervisor') &&
        !hasRole(session, 'maintenance_manager') &&
        !hasRole(session, 'maintenance_planner')
      ) {
        return NextResponse.json(
          { success: false, error: 'Only supervisors, managers, or planners can perform this action' },
          { status: 403 },
        );
      }
    }

    if (action === 'planner_close') {
      if (
        !isAdmin(session) &&
        !hasRole(session, 'maintenance_planner') &&
        !hasRole(session, 'maintenance_manager')
      ) {
        return NextResponse.json(
          { success: false, error: 'Only planners or managers can close work orders' },
          { status: 403 },
        );
      }
    }

    const workOrder = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, isLocked: true, lockReason: true },
    });
    if (!workOrder) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (workOrder.isLocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Work order is permanently locked${workOrder.lockReason ? ` (${workOrder.lockReason})` : ''}. No modifications are allowed by anyone, including administrators.`,
          isLocked: true,
        },
        { status: 403 },
      );
    }

    const auditCtx = extractAuditContext(request);

    if (action === 'submit' || action === undefined) {
      const result = await submitRepairCompletion(
        workOrderId,
        session as CompletionSessionContext,
        {
          notes: typeof body.completionNotes === 'string' ? body.completionNotes : undefined,
          failureDescription: typeof body.findings === 'string' ? body.findings : undefined,
          causeDescription: typeof body.rootCause === 'string' ? body.rootCause : undefined,
          actionDescription: typeof body.correctiveAction === 'string' ? body.correctiveAction : undefined,
          auditCtx: auditCtx as CompletionAuditContext,
        },
      );

      if (!result.success) {
        const status = result.readiness
          ? 422
          : result.error === 'Work order not found'
            ? 404
            : 400;
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            ...(result.readiness
              ? { blockers: result.readiness.blockers, warnings: result.readiness.warnings }
              : {}),
          },
          { status },
        );
      }

      const completion = await loadCompletion(workOrderId);
      return NextResponse.json({
        success: true,
        data: completion,
        ...(result.data?.costWarnings?.length ? { warnings: result.data.costWarnings } : {}),
      });
    }

    if (action === 'supervisor_approve') {
      const result = await verifyRepairWorkOrder(
        workOrderId,
        session as VerificationSessionContext,
        {
          notes: typeof body.supervisorReviewNotes === 'string' ? body.supervisorReviewNotes : undefined,
          qualityRating: typeof body.qualityRating === 'number' ? body.qualityRating : undefined,
          checklistPassed: typeof body.checklistPassed === 'boolean' ? body.checklistPassed : undefined,
          auditCtx: auditCtx as VerificationAuditContext,
        },
      );

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            ...(result.readiness
              ? { blockers: result.readiness.blockers, warnings: result.readiness.warnings }
              : {}),
          },
          { status: result.readiness ? 422 : 400 },
        );
      }

      return NextResponse.json({ success: true, data: await loadCompletion(workOrderId) });
    }

    if (action === 'supervisor_request_rework') {
      const result = await requestRepairRework(
        workOrderId,
        session as ReworkSessionContext,
        {
          reason: typeof body.reworkReason === 'string' ? body.reworkReason : '',
          category:
            typeof body.reworkCategory === 'string'
              ? body.reworkCategory
              : typeof body.category === 'string'
                ? body.category
                : undefined,
          evidence: Array.isArray(body.evidence)
            ? body.evidence.filter((item: unknown): item is string => typeof item === 'string')
            : undefined,
          notes: typeof body.supervisorReviewNotes === 'string' ? body.supervisorReviewNotes : undefined,
          auditCtx: auditCtx as ReworkAuditContext,
        },
      );

      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true, data: await loadCompletion(workOrderId) });
    }

    if (action === 'planner_close') {
      const result = await closeRepairWorkOrder(
        workOrderId,
        session as ClosureSessionContext,
        {
          notes: typeof body.closureNotes === 'string' ? body.closureNotes : undefined,
          componentId: typeof body.componentId === 'string' ? body.componentId : undefined,
          failureMode: typeof body.failureMode === 'string' ? body.failureMode : undefined,
          failureCause: typeof body.failureCause === 'string' ? body.failureCause : undefined,
          correctiveAction: typeof body.correctiveAction === 'string' ? body.correctiveAction : undefined,
          pmRecommendation: typeof body.pmRecommendation === 'string' ? body.pmRecommendation : undefined,
          followUpRequired: typeof body.followUpRequired === 'boolean' ? body.followUpRequired : undefined,
          followUpNotes: typeof body.followUpNotes === 'string' ? body.followUpNotes : undefined,
          auditCtx: auditCtx as ClosureAuditContext,
        },
      );

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            ...(result.readiness
              ? { blockers: result.readiness.blockers, warnings: result.readiness.warnings }
              : {}),
          },
          { status: result.readiness ? 422 : 400 },
        );
      }

      return NextResponse.json({ success: true, data: await loadCompletion(workOrderId) });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process completion action';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
