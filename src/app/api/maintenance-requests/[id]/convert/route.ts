import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifyUser } from '@/lib/notifications';
import { convertMRToWorkOrder } from '@/services/repairPlanning.service';
import type { ConvertMRToWOPayload } from '@/services/repairPlanning.service';
import { authorizeMaintenanceRequestPlant } from '@/lib/plant-auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── 1. Auth & permissions ──
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasAnyPermission(session, ['maintenance_requests.convert_to_wo'])) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    // ── 2. Parse params & body ──
    const { id } = await params;

    // Plant authorization
    const plantAuth = await authorizeMaintenanceRequestPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const mr = await db.maintenanceRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        assignedPlannerId: true,
        workOrderId: true,
      },
    });
    if (!mr) {
      return NextResponse.json({ success: false, error: 'Maintenance request not found' }, { status: 404 });
    }
    if (mr.status !== 'approved') {
      return NextResponse.json(
        { success: false, error: `Only approved maintenance requests can be converted to work orders. Current status: ${mr.status}` },
        { status: 409 },
      );
    }
    if (mr.assignedPlannerId && mr.assignedPlannerId !== session.userId && !isAdmin(session)) {
      return NextResponse.json(
        { success: false, error: 'Only the planner assigned to this maintenance request can convert it to a work order' },
        { status: 403 },
      );
    }

    const body: ConvertMRToWOPayload = await request.json();

    // ── 3. Delegate to domain service ──
    const result = await convertMRToWorkOrder(id, body, {
      userId: session.userId,
      fullName: session.fullName,
      roles: session.roles,
    });

    // ── 4. Shape HTTP response ──
    if (!result.success) {
      // Conflict (already converted)
      if (result.conflictWoNumber) {
        return NextResponse.json(
          { success: false, error: result.error, conflictWoNumber: result.conflictWoNumber },
          { status: 409 },
        );
      }
      // Not found
      if (result.error?.includes('not found')) {
        return NextResponse.json({ success: false, error: result.error }, { status: 404 });
      }
      // General client error (validation, no plant access, etc.)
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // ── 5. Fire-and-forget notifications ──
    result.notifications?.forEach((n) =>
      notifyUser(n.userId, n.type, n.title, n.message, n.entityType, n.entityId, n.actionUrl, n.options as { forceSms?: boolean; forceEmail?: boolean; skipQuietHours?: boolean }).catch(() => {}),
    );

    // ── 6. Success response ──
    return NextResponse.json({ success: true, data: result.workOrder }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to convert maintenance request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
