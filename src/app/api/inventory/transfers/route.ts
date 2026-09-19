import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, hasAnyPermission, isAdmin } from '@/lib/auth';

async function generateTransferNumber(): Promise<string> {
  const now = new Date();
  const prefix = `IT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await db.inventoryTransfer.findFirst({
    where: { transferNumber: { startsWith: prefix } },
    orderBy: { transferNumber: 'desc' },
    select: { transferNumber: true },
  });
  let nextNum = 1;
  if (latest) {
    const parts = latest.transferNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasAnyPermission(session, ['inventory_transfers.view', 'inventory_transfers.create', 'inventory_transfers.update', 'inventory_transfers.approve'])) {
      return NextResponse.json({ success: false, error: 'Insufficient inventory transfer permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { transferNumber: { contains: search } },
        { item: { name: { contains: search } } },
      ];
    }

    const [transfers, total, pendingCount, inTransitCount, completedCount, cancelledCount] = await Promise.all([
      db.inventoryTransfer.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          item: { select: { id: true, name: true, itemCode: true } },
          fromLocation: { select: { id: true, name: true, code: true } },
          toLocation: { select: { id: true, name: true, code: true } },
          requestedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.inventoryTransfer.count(),
      db.inventoryTransfer.count({ where: { status: 'pending' } }),
      db.inventoryTransfer.count({ where: { status: 'in_transit' } }),
      db.inventoryTransfer.count({ where: { status: 'completed' } }),
      db.inventoryTransfer.count({ where: { status: 'cancelled' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: transfers,
      kpis: { total, pending: pendingCount, inTransit: inTransitCount, completed: completedCount, cancelled: cancelledCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load transfers';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'inventory_transfers.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { itemId, fromLocationId, toLocationId, quantity, notes } = body;

    if (!itemId || !quantity) {
      return NextResponse.json({ success: false, error: 'Item and quantity are required' }, { status: 400 });
    }

    const transferNumber = await generateTransferNumber();
    const transfer = await db.inventoryTransfer.create({
      data: {
        transferNumber,
        itemId,
        fromLocationId: fromLocationId || null,
        toLocationId: toLocationId || null,
        quantity: parseFloat(quantity),
        requestedById: session.userId,
        notes: notes || null,
      },
      include: {
        item: { select: { id: true, name: true, itemCode: true } },
        fromLocation: { select: { id: true, name: true, code: true } },
        toLocation: { select: { id: true, name: true, code: true } },
        requestedBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'inventory_transfer', entityId: transfer.id, newValues: JSON.stringify({ transferNumber, quantity }) },
    });

    return NextResponse.json({ success: true, data: transfer }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create transfer';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
