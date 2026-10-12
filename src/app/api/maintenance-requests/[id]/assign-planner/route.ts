import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
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

    if (!hasAnyPermission(session, ['maintenance_requests.assign_planner'])) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const plantAuth = await authorizeMaintenanceRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const { plannerId } = body;

    if (!plannerId) {
      return NextResponse.json(
        { success: false, error: 'plannerId is required' },
        { status: 400 }
      );
    }

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

    // The assign-planner permission is authoritative. Non-admin users must also
    // be the accountable department supervisor (or explicit supervisor for a
    // request without a department); custom permission-bearing roles are valid.
    if (!isAdmin(session)) {
      if (mr.departmentId) {
        const dept = await db.department.findUnique({
          where: { id: mr.departmentId },
          select: { supervisorId: true },
        });
        if (!dept || dept.supervisorId !== session.userId) {
          return NextResponse.json({ success: false, error: 'You can only assign planners for requests from departments you supervise' }, { status: 403 });
        }
      } else if (mr.supervisorId !== session.userId) {
        return NextResponse.json({ success: false, error: 'You can only assign planners for requests assigned to you' }, { status: 403 });
      }
    }

    const planner = await db.user.findUnique({
      where: { id: plannerId },
      select: { id: true, fullName: true },
    });
    if (!planner) {
      return NextResponse.json({ success: false, error: 'Planner user not found' }, { status: 400 });
    }

    const oldValues = {
      assignedPlannerId: mr.assignedPlannerId,
      workflowStatus: mr.workflowStatus,
      status: mr.status,
    };

    const updatedMr = await db.maintenanceRequest.update({
      where: { id },
      data: {
        assignedPlannerId: plannerId,
        workflowStatus: 'assigned_to_planner',
        ...(mr.status !== 'approved' && mr.status !== 'rejected' && mr.status !== 'converted'
          ? { status: 'approved' }
          : {}),
      },
      include: {
        requester: { select: { id: true, fullName: true, username: true, department: true } },
        supervisor: { select: { id: true, fullName: true, username: true } },
        approver: { select: { id: true, fullName: true, username: true } },
        assignedPlanner: { select: { id: true, fullName: true, username: true } },
        workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'maintenance_request',
        entityId: id,
        oldValues: JSON.stringify(oldValues),
        newValues: JSON.stringify({
          assignedPlannerId: plannerId,
          workflowStatus: 'assigned_to_planner',
          status: updatedMr.status,
        }),
      },
    });

    if (plannerId !== session.userId) {
      await notifyUser(
        plannerId,
        'mr_assigned',
        `MR Assigned for Planning: ${mr.requestNumber}`,
        `Maintenance request "${mr.title}" (${mr.requestNumber}) has been assigned to you for planning by ${session.fullName}. Priority: ${(mr.priority || 'medium').toUpperCase()}.${mr.description ? `\nDescription: ${mr.description.substring(0, 150)}` : ''}`,
        'maintenance_request',
        id,
        `mr-detail?id=${id}`,
        { forceSms: true },
      );
    }

    return NextResponse.json({ success: true, data: updatedMr });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to assign planner';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
