import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission } from '@/lib/auth';
import { executeTransition } from '@/lib/state-machine';
import { notifyUser } from '@/lib/notifications';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canPlanWorkOrderForActor } from '@/services/workOrderAccess.service';

/**
 * POST /api/work-orders/[id]/approve
 *
 * Approves a work order (draft/requested → approved).
 * Typically done by a planner or supervisor.
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

    if (!hasAnyPermission(session, ['work_orders.update'])) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to approve work order' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Plant authorization
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const { notes, estimatedHours, plannedStart, plannedEnd } = body;

    const wo = await db.workOrder.findUnique({ where: { id } });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canPlanWorkOrderForActor(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Only the accountable planner or authorized maintenance management can approve this work order' },
        { status: 403 },
      );
    }

    const result = await executeTransition(
      'work_order',
      id,
      'approved',
      session,
      {
        reason: notes,
        extraData: {
          plannerId: session.userId,
          estimatedHours: estimatedHours ?? wo.estimatedHours,
          plannedStart: plannedStart ? new Date(plannedStart) : wo.plannedStart,
          plannedEnd: plannedEnd ? new Date(plannedEnd) : wo.plannedEnd,
        },
      },
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Notify the original requester if from MR
    if (wo.maintenanceRequestId) {
      const mr = await db.maintenanceRequest.findUnique({
        where: { id: wo.maintenanceRequestId },
        select: { requestedBy: true },
      });
      if (mr?.requestedBy && mr.requestedBy !== session.userId) {
        await notifyUser(
          mr.requestedBy,
          'wo_approved',
          'Work Order Approved',
          `${session.fullName} approved ${wo.woNumber}: "${wo.title}"`,
          'work_order',
          id,
          `wo-detail?id=${id}`,
        );
      }
    }

    // Re-fetch with includes
    const updated = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        planner: { select: { id: true, fullName: true, username: true } },
        maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
