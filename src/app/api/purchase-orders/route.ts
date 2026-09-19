import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, hasAnyPermission, isAdmin } from '@/lib/auth';

async function generatePONumber(): Promise<string> {
  const now = new Date();
  const prefix = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await db.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: 'desc' },
    select: { poNumber: true },
  });
  let nextNum = 1;
  if (latest) {
    const parts = latest.poNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasAnyPermission(session, [
      'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update',
      'purchase_orders.approve', 'purchase_orders.receive', 'purchase_orders.manage',
    ])) {
      return NextResponse.json({ success: false, error: 'Insufficient purchase order permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { poNumber: { contains: search } },
        { supplier: { name: { contains: search } } },
      ];
    }

    const [orders, total, pendingCount, approvedCount, receivedCount] = await Promise.all([
      db.purchaseOrder.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          _count: { select: { receivingRecords: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.purchaseOrder.count(),
      db.purchaseOrder.count({ where: { status: { in: ['draft', 'submitted'] } } }),
      db.purchaseOrder.count({ where: { status: { in: ['approved', 'partially_received'] } } }),
      db.purchaseOrder.count({ where: { status: 'received' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: orders,
      kpis: { total, pending: pendingCount, approved: approvedCount, received: receivedCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load purchase orders';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'purchase_orders.create') && !hasPermission(session, 'purchase_orders.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { supplierId, priority, expectedDelivery, notes, items } = body;

    if (!supplierId) {
      return NextResponse.json({ success: false, error: 'Supplier is required' }, { status: 400 });
    }

    const supplierExists = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplierExists) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });

    // Calculate total from items
    let totalAmount = 0;
    const itemsData = (items || []).map((item: { itemId: string; quantity: number; unitCost: number; description?: string }) => {
      const qty = parseFloat(String(item.quantity)) || 0;
      const cost = parseFloat(String(item.unitCost)) || 0;
      const total = qty * cost;
      totalAmount += total;
      return {
        itemId: item.itemId,
        quantity: qty,
        unitCost: cost,
        totalCost: total,
        description: item.description || null,
      };
    });

    const poNumber = await generatePONumber();
    const po = await db.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        priority: priority || 'medium',
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
        notes: notes || null,
        totalAmount,
        createdById: session.userId,
        items: { create: itemsData },
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'purchase_order', entityId: po.id, newValues: JSON.stringify({ poNumber, totalAmount }) },
    });

    return NextResponse.json({ success: true, data: po }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create purchase order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
