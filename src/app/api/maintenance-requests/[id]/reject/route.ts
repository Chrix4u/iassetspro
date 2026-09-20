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

    // Check permission
    if (!hasAnyPermission(session, ['maintenance_requests.reject'])) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason) {
      return NextResponse.json(
        { success: false, error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // Fetch MR with requester department for access control
    const mr = await db.maintenanceRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, username: true, department: true } },
      },
    });
    if (!mr) {
      return NextResponse.json(
        { success: false, error: 'Maintenance request not found' },
        { status: 404 }
      );
    }

    // Access control: use the authoritative Department.supervisorId rule,
    // matching approve and assign-planner. Department-name equality is not an
    // authorization boundary.
    if (!isAdmin(session)) {
      const currentUser = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, userRoles: { select: { role: { select: { slug: true } } } } },
      });
      const isSupervisor = currentUser?.userRoles.some((r: any) => r.role?.slug === 'maintenance_supervisor' || r.role?.slug === 'admin');
      if (!isSupervisor) {
        return NextResponse.json({ success: false, error: 'Only admin or department supervisor can reject requests' }, { status: 403 });
      }

      if (mr.departmentId) {
        const department = await db.department.findUnique({
          where: { id: mr.departmentId },
          select: { supervisorId: true },
        });
        if (!department || department.supervisorId !== session.userId) {
          return NextResponse.json({ success: false, error: 'You can only reject requests from departments you supervise' }, { status: 403 });
        }
      } else if (mr.supervisorId !== session.userId) {
        return NextResponse.json({ success: false, error: 'You can only reject requests assigned to you' }, { status: 403 });
      }
    }

    // Execute status transition via state machine (validates + updates + creates comment with reason)
    const result = await executeTransition(
      'maintenance_request',
      id,
      'rejected',
      session,
      {
        reason,
        extraData: {
          workflowStatus: 'rejected',
          approvedBy: session.userId,
          notes: reason ? `${mr.notes ? mr.notes + ' | ' : ''}Rejected: ${reason}` : mr.notes,
        },
      },
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Notify the requester with rejection reason
    if (mr.requestedBy && mr.requestedBy !== session.userId) {
      await notifyUser(
        mr.requestedBy,
        'mr_rejected',
        'Maintenance Request Rejected',
        `Your request "${mr.title}" (${mr.requestNumber}) has been rejected by ${session.fullName}. Reason: ${reason}`,
        'maintenance_request',
        id,
        `mr-detail?id=${id}`,
        { forceSms: true },
      );
    }

    // Re-fetch with includes to return full object (state machine returns plain record)
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
    const message = error instanceof Error ? error.message : 'Failed to reject request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
