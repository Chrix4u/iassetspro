import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

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

    const handover = await db.shiftHandover.findUnique({
      where: { id },
      include: {
        handedOverBy: { select: { id: true, fullName: true, username: true } },
        receivedBy: { select: { id: true, fullName: true, username: true } },
        workOrder: { select: { id: true, plantId: true } },
      },
    });

    if (!handover) {
      return NextResponse.json({ success: false, error: 'Shift handover not found' }, { status: 404 });
    }

    // Plant scope validation (through linked work order) — strict for operational entities
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, handover.workOrder?.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: handover });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load shift handover';
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
    if (!hasPermission(session, 'shift_handovers.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.shiftHandover.findUnique({
      where: { id },
      include: { workOrder: { select: { plantId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Shift handover not found' }, { status: 404 });
    }

    // Phase 3G: Plant scope for update — strict for operational entities
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, existing.workOrder?.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // A work-order-linked handover is lifecycle evidence owned by the canonical
    // WO handover flow. Generic edits could change the designated receiver or
    // custody evidence after active labor has already been closed and the WO
    // moved to pending_handover. Keep these records immutable here.
    if (existing.workOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Work-order-linked handovers cannot be edited through the generic handover endpoint',
        },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    // Whitelist: status/confirmedAt/overriddenBy/overriddenAt are NOT in allowedFields
    // and can NEVER be set via generic PUT — only via the dedicated confirm endpoint.
    const allowedFields = ['shiftType', 'shiftDate', 'fromShift', 'toShift', 'receivedById', 'tasksSummary', 'pendingIssues', 'safetyNotes', 'equipmentStatus', 'notes'];

    // Confirmed immutability: once confirmed, no further updates via PUT
    if (existing.status === 'confirmed') {
      return NextResponse.json({ success: false, error: 'Confirmed handover is immutable' }, { status: 400 });
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'shiftDate') {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else if (field === 'tasksSummary' || field === 'pendingIssues' || field === 'equipmentStatus') {
          updateData[field] = typeof body[field] === 'string' ? body[field] : JSON.stringify(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await db.shiftHandover.update({
      where: { id },
      data: updateData,
      include: {
        handedOverBy: { select: { id: true, fullName: true, username: true } },
        receivedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'shift_handover',
        entityId: id,
        oldValues: JSON.stringify({ shiftType: existing.shiftType, status: existing.status }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update shift handover';
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
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!session.roles.includes('admin')) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.shiftHandover.findUnique({
      where: { id },
      include: { workOrder: { select: { plantId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Shift handover not found' }, { status: 404 });
    }

    // Phase 3G: Plant scope for delete — strict for operational entities
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, existing.workOrder?.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Deleting a linked handover would strand the work order in
    // pending_handover with no canonical custody record. Any future lifecycle
    // cancellation/recovery must be implemented through the WO state machine.
    if (existing.workOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Work-order-linked handovers cannot be deleted through the generic handover endpoint',
        },
        { status: 400 },
      );
    }

    // Confirmed handovers cannot be deleted
    if (existing.status === 'confirmed') {
      return NextResponse.json({ success: false, error: 'Confirmed handover cannot be deleted' }, { status: 400 });
    }

    await db.shiftHandover.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'shift_handover',
        entityId: id,
        oldValues: JSON.stringify({ shiftType: existing.shiftType }),
      },
    });

    return NextResponse.json({ success: true, message: 'Shift handover deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete shift handover';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
