import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

function canManage(session: ReturnType<typeof getSession>) {
  if (!session) return false;
  return isAdmin(session)
    || hasPermission(session, 'digital_twin.manage')
    || hasPermission(session, 'work_orders.update')
    || hasPermission(session, 'work_orders.start')
    || hasPermission(session, 'work_orders.complete');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; installedPartId: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canManage(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const { id, installedPartId } = await params;
    const body = await request.json();
    const removalReason = String(body.removalReason || '').trim();
    const conditionOnRemoval = body.conditionOnRemoval ? String(body.conditionOnRemoval).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const status = body.status ? String(body.status).trim() : 'removed';

    if (!removalReason) {
      return NextResponse.json({ success: false, error: 'removalReason is required' }, { status: 400 });
    }
    if (!['removed', 'returned_to_store', 'scrapped'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid removal status' }, { status: 400 });
    }

    const existing = await db.installedSparePart.findFirst({
      where: { id: installedPartId, componentId: id },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Installed spare part not found' }, { status: 404 });
    if (existing.status !== 'installed') {
      return NextResponse.json({ success: false, error: 'Spare part is already removed from this component' }, { status: 409 });
    }

    const updated = await db.installedSparePart.update({
      where: { id: installedPartId },
      data: {
        status,
        removedAt: new Date(),
        removedById: session.userId,
        removalReason,
        conditionOnRemoval,
        notes: notes ?? existing.notes,
      },
      include: {
        inventoryItem: { select: { id: true, itemCode: true, name: true, unitOfMeasure: true } },
        workOrder: { select: { id: true, woNumber: true, title: true } },
      },
    });

    await createAuditLog(session.userId, 'installed_spare_parts', 'update', updated.id, {
      oldValues: { status: existing.status, removedAt: existing.removedAt },
      newValues: {
        status: updated.status,
        removedAt: updated.removedAt,
        removedById: updated.removedById,
        removalReason: updated.removalReason,
        conditionOnRemoval: updated.conditionOnRemoval,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: status === 'returned_to_store'
        ? 'Part marked removed. Complete the spare-part return workflow to restore store stock.'
        : 'Part removal recorded.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove installed spare part';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
