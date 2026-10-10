import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

const EPSILON = 0.001;

const TRANSITIONS: Record<string, Record<string, { status: string; creditStock: boolean }>> = {
  quarantined: {
    stock_as_is: { status: 'stocked', creditStock: true },
    send_for_repair: { status: 'in_repair', creditStock: false },
    return_to_supplier: { status: 'returned_to_supplier', creditStock: false },
    scrap: { status: 'scrapped', creditStock: false },
  },
  in_repair: {
    return_from_repair: { status: 'stocked', creditStock: true },
    return_to_supplier: { status: 'returned_to_supplier', creditStock: false },
    scrap: { status: 'scrapped', creditStock: false },
  },
};

const VALID_ACTIONS = new Set([
  'stock_as_is',
  'send_for_repair',
  'return_from_repair',
  'return_to_supplier',
  'scrap',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ success: false, error: `Invalid disposition action: ${action || '(empty)'}` }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `iassetspro:receiving-disposition:${id}`);

      const record = await tx.receivingRecord.findUnique({
        where: { id },
        include: {
          item: true,
          po: { select: { id: true, poNumber: true, status: true } },
        },
      });
      if (!record) throw new Error('NOT_FOUND:Receiving record not found');
      if (!canAccessPlantStrict(plantScope, record.item.plantId)) throw new Error('FORBIDDEN:Receiving record is outside your plant scope');

      const transition = TRANSITIONS[record.custodyStatus]?.[action];
      if (!transition) {
        throw new Error(`VALIDATION:Cannot apply ${action} while receipt is ${record.custodyStatus}`);
      }
      if (transition.creditStock && !record.item.isActive) {
        throw new Error('VALIDATION:Cannot release stock into an inactive inventory item');
      }

      const dispositionedAt = new Date();
      const custodyClaim = await tx.receivingRecord.updateMany({
        where: { id, custodyStatus: record.custodyStatus },
        data: {
          custodyStatus: transition.status,
          resolution: action,
          dispositionedById: session.userId,
          dispositionNotes: notes,
          dispositionedAt,
        },
      });
      if (custodyClaim.count !== 1) throw new Error('CONFLICT:Receiving custody changed concurrently; refresh and retry');

      let poStatus = record.po.status;
      if (action === 'return_to_supplier') {
        if (!['received', 'partially_received'].includes(record.po.status)) {
          throw new Error(`VALIDATION:Cannot reopen purchase order while it is ${record.po.status}`);
        }
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `iassetspro:po-receive:${record.poId}`);
        const poLine = await tx.purchaseOrderItem.findFirst({
          where: { poId: record.poId, itemId: record.itemId },
          select: { id: true, quantity: true, quantityReceived: true },
        });
        if (!poLine) throw new Error('NOT_FOUND:Purchase order line for receiving record not found');
        if (poLine.quantityReceived + EPSILON < record.quantityReceived) {
          throw new Error('CONFLICT:Purchase order received quantity is lower than the supplier return quantity');
        }
        const reopenedQuantity = Math.max(0, poLine.quantityReceived - record.quantityReceived);
        const lineClaim = await tx.purchaseOrderItem.updateMany({
          where: { id: poLine.id, quantityReceived: poLine.quantityReceived },
          data: { quantityReceived: reopenedQuantity },
        });
        if (lineClaim.count !== 1) throw new Error('CONFLICT:Purchase order quantity changed concurrently; refresh and retry');

        const lines = await tx.purchaseOrderItem.findMany({
          where: { poId: record.poId },
          select: { quantity: true, quantityReceived: true },
        });
        const allReceived = lines.length > 0 && lines.every((line) => line.quantityReceived >= line.quantity - EPSILON);
        const anyReceived = lines.some((line) => line.quantityReceived > EPSILON);
        poStatus = allReceived ? 'received' : anyReceived ? 'partially_received' : 'approved';
        const poClaim = await tx.purchaseOrder.updateMany({
          where: { id: record.poId, status: record.po.status },
          data: { status: poStatus },
        });
        if (poClaim.count !== 1) throw new Error('CONFLICT:Purchase order status changed concurrently; refresh and retry');
      }

      let previousStock = record.item.currentStock;
      let newStock = previousStock;
      if (transition.creditStock) {
        newStock = previousStock + record.quantityReceived;
        const stockClaim = await tx.inventoryItem.updateMany({
          where: { id: record.itemId, currentStock: previousStock, isActive: true },
          data: { currentStock: newStock },
        });
        if (stockClaim.count !== 1) throw new Error('CONFLICT:Inventory stock changed concurrently; refresh and retry');

        await tx.stockMovement.create({
          data: {
            itemId: record.itemId,
            type: 'in',
            quantity: record.quantityReceived,
            previousStock,
            newStock,
            reason: action === 'return_from_repair'
              ? `Refurbished receipt released to stock (${record.po.poNumber})`
              : `Quarantined receipt released to stock (${record.po.poNumber})`,
            referenceType: 'receiving_record',
            referenceId: id,
            performedById: session.userId,
            notes,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'receiving_disposition',
          entityType: 'receiving_record',
          entityId: id,
          oldValues: JSON.stringify({ custodyStatus: record.custodyStatus, currentStock: previousStock, poStatus: record.po.status }),
          newValues: JSON.stringify({ custodyStatus: transition.status, resolution: action, stockCredited: transition.creditStock, currentStock: newStock, poStatus, notes }),
        },
      });

      const updated = await tx.receivingRecord.findUniqueOrThrow({
        where: { id },
        include: {
          po: { select: { id: true, poNumber: true, supplier: { select: { id: true, name: true } } } },
          item: { select: { id: true, name: true, itemCode: true, currentStock: true } },
          receivedBy: { select: { id: true, fullName: true } },
          dispositionedBy: { select: { id: true, fullName: true } },
        },
      });

      return { updated, stockCredited: transition.creditStock, previousStock, newStock, poStatus };
    });

    return NextResponse.json({
      success: true,
      data: result.updated,
      stockCredited: result.stockCredited,
      previousStock: result.previousStock,
      newStock: result.newStock,
      poStatus: result.poStatus,
    });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : 'Failed to disposition receiving record';
    if (raw.startsWith('NOT_FOUND:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 404 });
    if (raw.startsWith('FORBIDDEN:')) return NextResponse.json({ success: false, error: raw.slice(10) }, { status: 403 });
    if (raw.startsWith('VALIDATION:')) return NextResponse.json({ success: false, error: raw.slice(11) }, { status: 400 });
    if (raw.startsWith('CONFLICT:')) return NextResponse.json({ success: false, error: raw.slice(9) }, { status: 409 });
    return NextResponse.json({ success: false, error: raw }, { status: 500 });
  }
}
