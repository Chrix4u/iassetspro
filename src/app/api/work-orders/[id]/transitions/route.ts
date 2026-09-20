import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canPerformWorkOrderTransition, canViewWorkOrder } from '@/services/workOrderAccess.service';
import { getAvailableTransitions } from '@/lib/state-machine';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

export async function GET(
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

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        assignedBy: true,
        teamMembers: { select: { userId: true, role: true } },
        shiftHandovers: {
          where: { status: { in: ['pending', 'confirmed'] } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { receivedById: true },
        },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Access denied — you are not part of this work order workflow' },
        { status: 403 },
      );
    }

    const accessSnapshot = {
      ...wo,
      handoverReceiverId: wo.shiftHandovers[0]?.receivedById ?? null,
    };
    const transitions = (await getAvailableTransitions('work_order', wo.status, session))
      .filter((transition) => canPerformWorkOrderTransition(session, accessSnapshot, transition.toStatus));

    return NextResponse.json({ success: true, data: transitions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load transitions';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
