import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canViewWorkOrder } from '@/services/workOrderAccess.service';

async function authorizeCommentAccess(
  request: NextRequest,
  session: NonNullable<ReturnType<typeof getSession>>,
  workOrderId: string,
) {
  const plantAuth = await authorizeWorkOrderPlant(request, session, workOrderId);
  if (!plantAuth.ok) return plantAuth.response;

  const wo = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      assignedTo: true,
      teamLeaderId: true,
      assignedSupervisorId: true,
      plannerId: true,
      teamMembers: { select: { userId: true } },
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

  return null;
}

// GET /api/work-orders/[id]/comments
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
    const authError = await authorizeCommentAccess(request, session, id);
    if (authError) return authError;

    const comments = await db.workOrderComment.findMany({
      where: { workOrderId: id },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: comments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load comments';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
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
    const authError = await authorizeCommentAccess(request, session, id);
    if (authError) return authError;

    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Comment content is required' },
        { status: 400 }
      );
    }

    const wo = await db.workOrder.findUnique({ where: { id } });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const comment = await db.workOrderComment.create({
      data: {
        workOrderId: id,
        userId: session.userId,
        content: content.trim(),
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
    });

    // Notify WO planner/creator if commenter is different
    if (wo.plannerId && wo.plannerId !== session.userId) {
      await notifyUser(
        wo.plannerId,
        'wo_comment',
        'New Comment on WO',
        `${session.fullName} commented on ${wo.woNumber}: "${content.trim().substring(0, 80)}${content.trim().length > 80 ? '...' : ''}"`,
        'work_order',
        id,
        `wo-detail?id=${id}`,
      );
    }

    // Also notify the assignee if different from commenter and planner
    if (wo.assignedTo && wo.assignedTo !== session.userId && wo.assignedTo !== wo.plannerId) {
      await notifyUser(
        wo.assignedTo,
        'wo_comment',
        'New Comment on WO',
        `${session.fullName} commented on ${wo.woNumber}: "${content.trim().substring(0, 80)}${content.trim().length > 80 ? '...' : ''}"`,
        'work_order',
        id,
        `wo-detail?id=${id}`,
      );
    }

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add comment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
