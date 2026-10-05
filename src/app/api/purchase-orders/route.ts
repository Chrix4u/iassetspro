import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { purchaseOrderPlantWhere } from '@/lib/purchase-order-access';

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

    if (!hasAnyPermission(session, ['inventory.view_all', 'inventory.manage', 'inventory.create', 'inventory.update', 'inventory.stock_in', 'inventory.stock_out', 'inventory.export']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');

    const plantWhere = purchaseOrderPlantWhere(plantScope);
    const where: Prisma.PurchaseOrderWhereInput = { ...plantWhere };
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
      db.purchaseOrder.count({ where: plantWhere }),
      db.purchaseOrder.count({ where: { ...plantWhere, status: { in: ['draft', 'submitted'] } } }),
      db.purchaseOrder.count({ where: { ...plantWhere, status: { in: ['approved', 'partially_received'] } } }),
      db.purchaseOrder.count({ where: { ...plantWhere, status: 'received' } }),
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
    if (!hasPermission(session, 'inventory.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const body = await request.json();
    const { supplierId, priority, expectedDelivery, notes, items } = body;

    if (!supplierId) {
      return NextResponse.json({ success: false, error: 'Supplier is required' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one purchase-order item is required' }, { status: 400 });
    }

    const itemIds = items.map((item: { itemId?: string }) => String(item.itemId || '')).filter(Boolean);
    if (itemIds.length !== items.length || new Set(itemIds).size !== itemIds.length) {
      return NextResponse.json({ success: false, error: 'Each purchase-order line must reference one unique inventory item' }, { status: 400 });
    }
    const inventoryItems = await db.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, plantId: true, isActive: true },
    });
    if (inventoryItems.length !== itemIds.length || inventoryItems.some((item) => !item.isActive)) {
      return NextResponse.json({ success: false, error: 'One or more inventory items are missing or inactive' }, { status: 400 });
    }
    if (inventoryItems.some((item) => !canAccessPlantStrict(plantScope, item.plantId))) {
      return NextResponse.json({ success: false, error: 'One or more inventory items are outside your plant scope' }, { status: 403 });
    }
    if (new Set(inventoryItems.map((item) => item.plantId)).size !== 1) {
      return NextResponse.json({ success: false, error: 'A purchase order cannot mix inventory items from different plants' }, { status: 400 });
    }

    const supplierExists = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplierExists) return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });

    // Calculate total from items
    let totalAmount = 0;
    const itemsData = items.map((item: { itemId: string; quantity: number; unitCost: number; description?: string }) => {
      const qty = Number(item.quantity);
      const cost = Number(item.unitCost);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('VALIDATION:Purchase-order quantities must be positive');
      if (!Number.isFinite(cost) || cost < 0) throw new Error('VALIDATION:Purchase-order unit costs cannot be negative');
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
    if (message.startsWith('VALIDATION:')) return NextResponse.json({ success: false, error: message.slice(11) }, { status: 400 });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
