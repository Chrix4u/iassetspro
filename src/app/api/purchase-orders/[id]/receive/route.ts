import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { canAccessPurchaseOrderLines } from '@/lib/purchase-order-access';

const EPSILON = 0.001;
const VALID_CONDITIONS = ['good', 'damaged', 'defective'] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['inventory.update', 'inventory.stock_in', 'inventory.manage']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    const qty = Number(body.quantityReceived);
    const condition = body.condition == null ? 'good' : String(body.condition);
    if (!VALID_CONDITIONS.includes(condition as (typeof VALID_CONDITIONS)[number])) {
      return NextResponse.json({ success: false, error: `Invalid receiving condition: ${condition}` }, { status: 400 });
    }
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    if (!itemId || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ success: false, error: 'Item ID and a positive quantity received are required' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      // Serialize receipts for one PO so separate lines cannot race the final PO status.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `iassetspro:po-receive:${id}`);

      const po = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: { include: { item: true } } },
      });
      if (!po) throw new Error('NOT_FOUND:Purchase order not found');
      if (!['approved', 'partially_received'].includes(po.status)) {
        throw new Error('VALIDATION:Only approved/partially_received POs can receive items');
      }
      if (!canAccessPurchaseOrderLines(plantScope, po.items)) {
        throw new Error('FORBIDDEN:Purchase order contains inventory outside your plant scope');
      }

      const poItem = po.items.find((line) => line.itemId === itemId);
      if (!poItem) throw new Error('NOT_FOUND:Item not found in this PO');
      if (!poItem.item.isActive) throw new Error('VALIDATION:Cannot receive stock into an inactive inventory item');
      if (!canAccessPlantStrict(plantScope, poItem.item.plantId)) throw new Error('FORBIDDEN:Inventory item is outside your plant scope');

      const remaining = Math.max(0, poItem.quantity - poItem.quantityReceived);
      if (qty > remaining + EPSILON) {
        throw new Error(`VALIDATION:Receipt quantity (${qty}) exceeds remaining PO quantity (${remaining})`);
      }

      const lineClaim = await tx.purchaseOrderItem.updateMany({
        where: { id: poItem.id, quantityReceived: poItem.quantityReceived },
        data: { quantityReceived: poItem.quantityReceived + qty },
      });
      if (lineClaim.count !== 1) throw new Error('CONFLICT:PO line was received concurrently; refresh and retry');

      const stockCredited = condition === 'good';
      let previousStock = poItem.item.currentStock;
      let newStock = previousStock;
      if (stockCredited) {
        newStock = previousStock + qty;
        const stockClaim = await tx.inventoryItem.updateMany({
          where: { id: itemId, currentStock: previousStock, isActive: true },
          data: { currentStock: newStock },
        });
        if (stockClaim.count !== 1) throw new Error('CONFLICT:Inventory stock changed concurrently; refresh and retry');

        await tx.stockMovement.create({
          data: {
            itemId,
            type: 'in',
            quantity: qty,
            previousStock,
            newStock,
            reason: `PO Receipt ${po.poNumber}`,
            referenceType: 'purchase_order',
            referenceId: id,
            performedById: session.userId,
            notes,
          },
        });
      }

      await tx.receivingRecord.create({
        data: {
          poId: id,
          itemId,
          quantityReceived: qty,
          condition,
          receivedById: session.userId,
          notes,
        },
      });

      const lines = await tx.purchaseOrderItem.findMany({ where: { poId: id }, select: { quantity: true, quantityReceived: true } });
      const allReceived = lines.length > 0 && lines.every((line) => line.quantityReceived >= line.quantity - EPSILON);
      const anyReceived = lines.some((line) => line.quantityReceived > EPSILON);
      const newStatus = allReceived ? 'received' : anyReceived ? 'partially_received' : 'approved';

      const poStatusClaim = await tx.purchaseOrder.updateMany({
        where: { id, status: po.status },
        data: { status: newStatus },
      });
      if (poStatusClaim.count !== 1) throw new Error('CONFLICT:Purchase order status changed concurrently; refresh and retry');

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'receive',
          entityType: 'purchase_order',
          entityId: id,
          oldValues: JSON.stringify({ status: po.status, quantityReceived: poItem.quantityReceived, currentStock: previousStock }),
          newValues: JSON.stringify({ status: newStatus, quantityReceived: poItem.quantityReceived + qty, condition, stockCredited, currentStock: newStock }),
        },
      });

      return { stockCredited, previousStock, newStock, condition, newStatus };
    });

    const finalPO = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, name: true, itemCode: true, currentStock: true, category: true } } } },
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

    return NextResponse.json({ success: true, data: finalPO, receipt: result });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : 'Failed to receive items';
    if (raw.startsWith('NOT_FOUND:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 404 });
    if (raw.startsWith('FORBIDDEN:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 403 });
    if (raw.startsWith('VALIDATION:')) return NextResponse.json({ success: false, error: raw.slice(11) }, { status: 400 });
    if (raw.startsWith('CONFLICT:')) return NextResponse.json({ success: false, error: raw.slice(9) }, { status: 409 });
    return NextResponse.json({ success: false, error: raw }, { status: 500 });
  }
}
