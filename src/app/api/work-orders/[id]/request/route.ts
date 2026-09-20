import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { executeTransition } from '@/lib/state-machine';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canPlanWorkOrderForActor } from '@/services/workOrderAccess.service';

/**
 * POST /api/work-orders/[id]/request
 *
 * Submits a draft work order for review (draft → requested).
 * The WO moves from the planner's draft to a review queue.
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

    // Plant authorization
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const { notes } = body;

    const wo = await db.workOrder.findUnique({ where: { id } });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canPlanWorkOrderForActor(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Only the accountable planner or authorized maintenance management can submit this work order' },
        { status: 403 },
      );
    }

    const result = await executeTransition(
      'work_order',
      id,
      'requested',
      session,
      { reason: notes },
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Re-fetch with includes
    const updated = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        planner: { select: { id: true, fullName: true, username: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to submit work order for review';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
