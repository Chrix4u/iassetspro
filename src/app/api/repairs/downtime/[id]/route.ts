import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { canViewWorkOrder, hasWorkOrderManagementOverride } from '@/services/workOrderAccess.service';

// GET /api/repairs/downtime/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const record = await db.workOrderDowntime.findUnique({
      where: { id },
      include: { workOrder: { select: { id: true, woNumber: true, title: true, status: true, plantId: true, assignedTo: true, teamLeaderId: true, assignedSupervisorId: true, plannerId: true, teamMembers: { select: { userId: true, role: true, accessLevel: true } }, maintenanceRequest: { select: { requestedBy: true } } } } },
    });
    if (!record) return NextResponse.json({ success: false, error: 'Downtime record not found' }, { status: 404 });

    // Plant scope validation
    const plantScope = await getPlantScope(request, session);
    const recordPlantId = record.plantId || record.workOrder?.plantId;
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, recordPlantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    if (!hasAnyPermission(session, ['downtime.view', 'work_orders.view', 'work_orders.view_own']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    if (!canViewWorkOrder(session, record.workOrder)) {
      return NextResponse.json({ success: false, error: 'Access denied — this downtime record is outside your work-order scope' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load downtime record';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/repairs/downtime/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { downtimeEnd, reason, category, impactLevel, productionLoss, notes } = body;

    const existing = await db.workOrderDowntime.findUnique({
      where: { id },
      include: {
        workOrder: { select: { plantId: true, assignedSupervisorId: true } },
      },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    const recordPlantId = existing.plantId || existing.workOrder?.plantId;
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, recordPlantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Creator may maintain their own record. Otherwise only system/maintenance
    // management or the accountable WO supervisor may edit it.
    const canManageRecord =
      hasWorkOrderManagementOverride(session)
      || existing.workOrder?.assignedSupervisorId === session.userId;
    if (existing.createdById !== session.userId && !canManageRecord) {
      return NextResponse.json({ success: false, error: 'You can only edit your own downtime records or records you supervise' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (downtimeEnd !== undefined) {
      const end = new Date(downtimeEnd);
      const start = new Date(existing.downtimeStart);
      data.downtimeEnd = end;
      data.durationMinutes = Math.max(0, (end.getTime() - start.getTime()) / 60000);
    }
    if (reason !== undefined) data.reason = reason;
    if (category !== undefined) data.category = category;
    if (impactLevel !== undefined) data.impactLevel = impactLevel;
    if (productionLoss !== undefined) data.productionLoss = productionLoss;
    if (notes !== undefined) data.notes = notes;

    const updated = await db.workOrderDowntime.update({ where: { id }, data });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'update', entityType: 'wo_downtime', entityId: id, oldValues: JSON.stringify(existing), newValues: JSON.stringify(data) },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update downtime record';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/repairs/downtime/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const existing = await db.workOrderDowntime.findUnique({
      where: { id },
      include: {
        workOrder: { select: { plantId: true, assignedSupervisorId: true } },
      },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    const recordPlantId = existing.plantId || existing.workOrder?.plantId;
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, recordPlantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const canManageRecord =
      hasWorkOrderManagementOverride(session)
      || existing.workOrder?.assignedSupervisorId === session.userId;
    if (existing.createdById !== session.userId && !canManageRecord) {
      return NextResponse.json({ success: false, error: 'You can only delete your own downtime records or records you supervise' }, { status: 403 });
    }

    await db.workOrderDowntime.delete({ where: { id } });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'delete', entityType: 'wo_downtime', entityId: id, oldValues: JSON.stringify(existing) },
    });

    return NextResponse.json({ success: true, message: 'Downtime record deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete downtime record';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
