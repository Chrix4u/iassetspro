import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canViewInventoryArea } from '@/lib/inventory-access';

async function generateAdjNumber(): Promise<string> {
  const now = new Date();
  const prefix = `ADJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await db.inventoryAdjustment.findFirst({
    where: { adjustmentNumber: { startsWith: prefix } },
    orderBy: { adjustmentNumber: 'desc' },
    select: { adjustmentNumber: true },
  });
  let nextNum = 1;
  if (latest) {
    const parts = latest.adjustmentNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    if (!canViewInventoryArea(session, 'inventory_adjustments.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to view inventory adjustments' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (type && type !== 'all') where.type = type;
    if (search) {
      where.OR = [
        { adjustmentNumber: { contains: search } },
        { reason: { contains: search } },
        { item: { name: { contains: search } } },
      ];
    }

    const [adjustments, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      db.inventoryAdjustment.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          item: { select: { id: true, name: true, itemCode: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.inventoryAdjustment.count(),
      db.inventoryAdjustment.count({ where: { status: 'pending' } }),
      db.inventoryAdjustment.count({ where: { status: 'approved' } }),
      db.inventoryAdjustment.count({ where: { status: 'rejected' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: adjustments,
      kpis: { total, pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load adjustments';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'inventory_adjustments.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { itemId, type, quantity, reason, notes } = body;

    if (!itemId || !type || !quantity || !reason) {
      return NextResponse.json({ success: false, error: 'Item, type, quantity, and reason are required' }, { status: 400 });
    }

    const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });

    const adjustmentNumber = await generateAdjNumber();
    const adjustment = await db.inventoryAdjustment.create({
      data: {
        adjustmentNumber,
        itemId,
        type,
        quantity: parseFloat(quantity),
        reason,
        notes: notes || null,
        createdById: session.userId,
      },
      include: {
        item: { select: { id: true, name: true, itemCode: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'inventory_adjustment', entityId: adjustment.id, newValues: JSON.stringify({ adjustmentNumber, type, quantity }) },
    });

    return NextResponse.json({ success: true, data: adjustment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create adjustment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
