import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'purchase_orders.receive') && !hasPermission(session, 'purchase_orders.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const po = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!po) return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    if (!['approved', 'partially_received'].includes(po.status)) {
      return NextResponse.json({ success: false, error: 'Only approved/partially_received POs can receive items' }, { status: 400 });
    }

    const { itemId, quantityReceived, condition, notes } = body;
    if (!itemId || !quantityReceived) {
      return NextResponse.json({ success: false, error: 'Item ID and quantity received are required' }, { status: 400 });
    }

    // Find the PO item
    const poItem = po.items.find((pi) => pi.itemId === itemId);
    if (!poItem) return NextResponse.json({ success: false, error: 'Item not found in this PO' }, { status: 404 });

    const qty = parseFloat(String(quantityReceived));
    if (qty <= 0) return NextResponse.json({ success: false, error: 'Quantity must be positive' }, { status: 400 });

    // Create receiving record and update stock
    const invItem = await db.inventoryItem.findUnique({ where: { id: itemId } });

    await db.$transaction([
      db.receivingRecord.create({
        data: {
          poId: id,
          itemId,
          quantityReceived: qty,
          condition: condition || 'good',
          receivedById: session.userId,
          notes: notes || null,
        },
      }),
      db.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { quantityReceived: poItem.quantityReceived + qty },
      }),
      ...(invItem ? [db.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: invItem.currentStock + qty },
      })] : []),
      ...(invItem ? [db.stockMovement.create({
        data: {
          itemId,
          type: 'in',
          quantity: qty,
          previousStock: invItem.currentStock,
          newStock: invItem.currentStock + qty,
          reason: 'PO Receipt',
          referenceType: 'purchase_order',
          referenceId: id,
          performedById: session.userId,
          notes: notes || null,
        },
      })] : []),
    ]);

    // Check if all items are fully received
    const updatedPO = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    let allReceived = true;
    let anyReceived = false;
    if (updatedPO) {
      for (const item of updatedPO.items) {
        if (item.quantityReceived > 0) anyReceived = true;
        if (item.quantityReceived < item.quantity) { allReceived = false; break; }
      }
    }

    const newStatus = allReceived ? 'received' : 'partially_received';
    const finalPO = await db.purchaseOrder.update({
      where: { id },
      data: { status: newStatus },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        receivingRecords: {
          include: {
            item: { select: { id: true, name: true, itemCode: true } },
            receivedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'update', entityType: 'purchase_order', entityId: id, oldValues: JSON.stringify({ status: po.status }), newValues: JSON.stringify({ status: newStatus }) },
    });

    return NextResponse.json({ success: true, data: finalPO });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to receive items';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
