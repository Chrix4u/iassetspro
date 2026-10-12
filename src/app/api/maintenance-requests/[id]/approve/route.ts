import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { executeTransition } from '@/lib/state-machine';
import { authorizeMaintenanceRequestPlant } from '@/lib/plant-auth-helpers';

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
    const auth = await authorizeMaintenanceRequestPlant(request, session, id);
    if (!auth.ok) return auth.response;

    if (!hasAnyPermission(session, ['maintenance_requests.approve'])) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { notes } = body;

    const mr = await db.maintenanceRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!mr) {
      return NextResponse.json(
        { success: false, error: 'Maintenance request not found' },
        { status: 404 }
      );
    }

    // Permission is established above. Non-admin approvers must additionally be
    // the accountable department supervisor (or the explicitly assigned
    // supervisor for requests without a department). Do not re-gate by a role
    // slug here because custom roles can legitimately carry approval authority.
    if (!isAdmin(session)) {
      if (mr.departmentId) {
        const dept = await db.department.findUnique({
          where: { id: mr.departmentId },
          select: { supervisorId: true },
        });
        if (!dept || dept.supervisorId !== session.userId) {
          return NextResponse.json({ success: false, error: 'You can only approve requests from departments you supervise' }, { status: 403 });
        }
      } else if (mr.supervisorId !== session.userId) {
        return NextResponse.json({ success: false, error: 'You can only approve requests assigned to you' }, { status: 403 });
      }
    }

    const result = await executeTransition(
      'maintenance_request',
      id,
      'approved',
      session,
      {
        extraData: {
          workflowStatus: 'approved',
          approvedBy: session.userId,
          notes: notes || mr.notes,
        },
      },
    );

    if (!result.success) {
      console.error(`[approve] Transition failed for MR ${id}: status=${mr.status}, user=${session.userId}, roles=[${session.roles.join(',')}], error=${result.error}`);
      return NextResponse.json({
        success: false,
        error: result.error,
        debug: {
          mrId: id,
          mrStatus: mr.status,
          targetStatus: 'approved',
          userRoles: session.roles,
          userId: session.userId,
        },
      }, { status: 400 });
    }

    if (mr.requestedBy && mr.requestedBy !== session.userId) {
      const approverName = session.fullName || session.userId;
      await notifyUser(
        mr.requestedBy,
        'mr_approved',
        `MR Approved: ${mr.requestNumber}`,
        `Your maintenance request "${mr.title}" has been approved by ${approverName} and will be assigned to a planner.`,
        'maintenance_request',
        id,
        `mr-detail?id=${id}`,
        { forceSms: true },
      );
    }

    const updated = await db.maintenanceRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, username: true, department: true } },
        supervisor: { select: { id: true, fullName: true, username: true } },
        approver: { select: { id: true, fullName: true, username: true } },
        assignedPlanner: { select: { id: true, fullName: true, username: true } },
        workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
