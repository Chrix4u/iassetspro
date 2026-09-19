import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const requiredPermission = body.action === 'approve'
      ? 'inventory_transfers.approve'
      : 'inventory_transfers.update';
    if (!hasPermission(session, requiredPermission) && !isAdmin(session)) {
      return NextResponse.json({
        success: false,
        error: `Insufficient permissions — requires ${requiredPermission}`,
      }, { status: 403 });
    }
    const existing = await db.inventoryTransfer.findUnique({
      where: { id },
      include: { item: true },
    });

    if (!existing) return NextResponse.json({ success: false, error: 'Transfer not found' }, { status: 404 });

    const includeOpts = {
      item: { select: { id: true, name: true, itemCode: true } },
      fromLocation: { select: { id: true, name: true, code: true } },
      toLocation: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
    };

    if (body.action === 'approve') {
      if (existing.status !== 'pending') return NextResponse.json({ success: false, error: 'Only pending transfers can be approved' }, { status: 400 });
      const updated = await db.inventoryTransfer.update({
        where: { id },
        data: { status: 'in_transit', approvedById: session.userId, approvedAt: new Date() },
        include: includeOpts,
      });
      await db.auditLog.create({ data: { userId: session.userId, action: 'update', entityType: 'inventory_transfer', entityId: id, oldValues: JSON.stringify({ status: 'pending' }), newValues: JSON.stringify({ status: 'in_transit' }) } });
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'complete') {
      if (existing.status !== 'in_transit') return NextResponse.json({ success: false, error: 'Only in_transit transfers can be completed' }, { status: 400 });

      // Deduct from source, add to destination
      const sourceStock = existing.item.currentStock;
      await db.$transaction([
        db.inventoryTransfer.update({
          where: { id },
          data: { status: 'completed', completedAt: new Date() },
        }),
        db.inventoryItem.update({
          where: { id: existing.itemId },
          data: { currentStock: Math.max(0, sourceStock - existing.quantity) },
        }),
        db.stockMovement.create({
          data: {
            itemId: existing.itemId,
            type: 'out',
            quantity: existing.quantity,
            previousStock: sourceStock,
            newStock: Math.max(0, sourceStock - existing.quantity),
            reason: 'Transfer out',
            referenceType: 'transfer',
            referenceId: id,
            performedById: session.userId,
          },
        }),
        db.stockMovement.create({
          data: {
            itemId: existing.itemId,
            type: 'in',
            quantity: existing.quantity,
            previousStock: Math.max(0, sourceStock - existing.quantity),
            newStock: sourceStock,
            reason: 'Transfer in',
            referenceType: 'transfer',
            referenceId: id,
            performedById: session.userId,
          },
        }),
      ]);

      const updated = await db.inventoryTransfer.findUnique({ where: { id }, include: includeOpts });
      await db.auditLog.create({ data: { userId: session.userId, action: 'update', entityType: 'inventory_transfer', entityId: id, oldValues: JSON.stringify({ status: 'in_transit' }), newValues: JSON.stringify({ status: 'completed' }) } });
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'cancel') {
      if (!['pending', 'in_transit'].includes(existing.status)) return NextResponse.json({ success: false, error: 'Only pending or in_transit transfers can be cancelled' }, { status: 400 });
      const updated = await db.inventoryTransfer.update({
        where: { id },
        data: { status: 'cancelled', approvedById: session.userId, approvedAt: new Date() },
        include: includeOpts,
      });
      await db.auditLog.create({ data: { userId: session.userId, action: 'update', entityType: 'inventory_transfer', entityId: id, oldValues: JSON.stringify({ status: existing.status }), newValues: JSON.stringify({ status: 'cancelled' }) } });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: 'Invalid action. Use "approve", "complete", or "cancel".' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update transfer';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
