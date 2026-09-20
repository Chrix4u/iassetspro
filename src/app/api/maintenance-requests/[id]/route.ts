import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { authorizeMaintenanceRequestPlant } from '@/lib/plant-auth-helpers';
import { notifyUser, notifyAdmins } from '@/lib/notifications';

// Helper: check if user can edit/delete a pending request (must be requester or admin)
async function canModifyPendingRequest(id: string, session: any) {
  const existing = await db.maintenanceRequest.findUnique({ where: { id } });
  if (!existing) return { error: 'Maintenance request not found', status: 404 };
  if (existing.status !== 'pending') return { error: 'Can only modify requests with status "pending"', status: 400 };
  if (existing.requestedBy !== session.userId && !isAdmin(session)) {
    return { error: 'Only the requester can modify this request', status: 403 };
  }
  return { mr: existing };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (!hasPermission(session, 'maintenance_requests.view') && !hasPermission(session, 'maintenance_requests.view_own') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const mr = await db.maintenanceRequest.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, serialNumber: true, location: true } },
        requester: { select: { id: true, fullName: true, username: true, department: true } },
        supervisor: { select: { id: true, fullName: true, username: true } },
        approver: { select: { id: true, fullName: true, username: true } },
        assignedPlanner: { select: { id: true, fullName: true, username: true } },
        workOrder: {
          select: {
            id: true,
            woNumber: true,
            title: true,
            status: true,
            priority: true,
          },
        },
        comments: {
          include: { user: { select: { id: true, fullName: true, username: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!mr) {
      return NextResponse.json(
        { success: false, error: 'Maintenance request not found' },
        { status: 404 }
      );
    }

    // Ownership check: users with only view_own can only see their own requests
    if (!hasPermission(session, 'maintenance_requests.view') && !isAdmin(session)) {
      if (mr.requestedBy !== session.userId) {
        return NextResponse.json({ success: false, error: 'Maintenance request not found' }, { status: 404 });
      }
    }

    // IDOR protection: ensure user has access to this MR's plant
    if (!isAdmin(session)) {
      const plantScope = await getPlantScope(request, session);
      if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, mr.plantId)) {
        // Check if user has access to the MR's plant via their userPlant records
        const hasPlantAccess = await db.userPlant.findFirst({
          where: { userId: session.userId, plantId: mr.plantId },
        });
        if (!hasPlantAccess) {
          return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
        }
      }
    }

    // MaintenanceRequest.departmentId is a legacy scalar without a Prisma relation.
    // Resolve the department explicitly so the detail UI can distinguish the
    // employee/request department from the physical asset/request location.
    const department = mr.departmentId
      ? await db.department.findFirst({
          where: { id: mr.departmentId, ...(mr.plantId ? { plantId: mr.plantId } : {}) },
          select: { id: true, name: true, code: true, plantId: true, supervisorId: true },
        })
      : null;

    return NextResponse.json({ success: true, data: { ...mr, department } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load maintenance request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const hasUpdateAll = hasPermission(session, 'maintenance_requests.update') || isAdmin(session);
    const canUpdateOwn = hasPermission(session, 'maintenance_requests.update') || hasPermission(session, 'maintenance_requests.create');

    if (!hasUpdateAll && !canUpdateOwn) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    // Plant authorization
    const plantAuth = await authorizeMaintenanceRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();

    const existing = await db.maintenanceRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Maintenance request not found' },
        { status: 404 }
      );
    }

    // If request is pending, only the requester (or admin/supervisor with update) can edit it
    if (existing.status === 'pending' && !hasUpdateAll) {
      if (existing.requestedBy !== session.userId) {
        return NextResponse.json(
          { success: false, error: 'Only the requester can edit a pending request' },
          { status: 403 }
        );
      }
    }

    // Only allow updates if not already approved/rejected/converted
    if (['approved', 'rejected', 'converted'].includes(existing.status)) {
      // Only allow updating notes (by admin or supervisor)
      if (body.notes !== undefined) {
        const updated = await db.maintenanceRequest.update({
          where: { id },
          data: { notes: body.notes },
          include: {
            requester: { select: { id: true, fullName: true, username: true } },
            supervisor: { select: { id: true, fullName: true, username: true } },
          },
        });
        return NextResponse.json({ success: true, data: updated });
      }
      return NextResponse.json(
        { success: false, error: `Cannot update a request with status "${existing.status}"` },
        { status: 400 }
      );
    }

    // Build update data (only allow certain fields)
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'description', 'priority', 'category',
      'assetId', 'assetName', 'location', 'departmentId', 'plantId', 'machineDownStatus',
      'estimatedHours', 'slaHours', 'plannedStart', 'plannedEnd', 'notes',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'plannedStart' || field === 'plannedEnd') {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await db.maintenanceRequest.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, serialNumber: true } },
        requester: { select: { id: true, fullName: true, username: true } },
        supervisor: { select: { id: true, fullName: true, username: true } },
        approver: { select: { id: true, fullName: true, username: true } },
        assignedPlanner: { select: { id: true, fullName: true, username: true } },
        workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
      },
    });

    // Notify supervisor and admins when a pending request is updated (not by themselves)
    if (existing.status === 'pending' && Object.keys(updateData).length > 0) {
      const changedFields = Object.keys(updateData).join(', ');

      // Get the updater's full name (from session, avoids extra DB query)
      const updaterName = session.fullName || 'Unknown User';

      const notifyMessage = `Maintenance request ${existing.requestNumber} ("${existing.title}") has been updated by ${updaterName}. Changed: ${changedFields}`;

      // Notify the supervisor if assigned
      if (existing.supervisorId && existing.supervisorId !== session.userId) {
        await notifyUser(
          existing.supervisorId,
          'mr_assigned',
          'Maintenance Request Updated',
          notifyMessage,
          'maintenance_request',
          id,
          `mr-detail?id=${id}`,
        );
      }

      // Also notify admins if the updater is not an admin
      if (!isAdmin(session)) {
        await notifyAdmins(
          'mr_assigned',
          'Maintenance Request Updated',
          notifyMessage,
          'maintenance_request',
          id,
          `mr-detail?id=${id}`,
        );
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update maintenance request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;

    // Plant authorization
    const plantAuth = await authorizeMaintenanceRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    // Check: only pending requests, and only by requester or admin
    const check = await canModifyPendingRequest(id, session);
    if ('error' in check) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    // Delete associated comments first (cascade)
    await db.maintenanceRequestComment.deleteMany({ where: { maintenanceRequestId: id } });

    // Delete the request
    await db.maintenanceRequest.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Maintenance request deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete maintenance request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
