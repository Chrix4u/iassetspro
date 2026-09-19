import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canViewInventoryArea } from '@/lib/inventory-access';

async function generateReqNumber(): Promise<string> {
  const now = new Date();
  const prefix = `IR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await db.inventoryRequest.findFirst({
    where: { requestNumber: { startsWith: prefix } },
    orderBy: { requestNumber: 'desc' },
    select: { requestNumber: true },
  });
  let nextNum = 1;
  if (latest) {
    const parts = latest.requestNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    if (!canViewInventoryArea(session, 'material_requisitions.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to view inventory requisitions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (priority && priority !== 'all') where.priority = priority;
    if (search) {
      where.OR = [
        { requestNumber: { contains: search } },
        { title: { contains: search } },
      ];
    }

    const [requests, total, pendingCount, approvedCount, fulfilledCount] = await Promise.all([
      db.inventoryRequest.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
          requestedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.inventoryRequest.count(),
      db.inventoryRequest.count({ where: { status: 'pending' } }),
      db.inventoryRequest.count({ where: { status: 'approved' } }),
      db.inventoryRequest.count({ where: { status: { in: ['partially_fulfilled', 'fulfilled'] } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: requests,
      kpis: { total, pending: pendingCount, approved: approvedCount, fulfilled: fulfilledCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load requests';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'material_requisitions.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, priority, items, notes } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const requestNumber = await generateReqNumber();
    const req = await db.inventoryRequest.create({
      data: {
        requestNumber,
        title,
        description: description || null,
        priority: priority || 'medium',
        requestedById: session.userId,
        notes: notes || null,
        items: items ? {
          create: items.map((item: { itemId: string; quantity: number; unitCost?: number; notes?: string }) => ({
            itemId: item.itemId,
            quantityRequested: item.quantity,
            unitCost: item.unitCost || null,
            notes: item.notes || null,
          })),
        } : undefined,
      },
      include: {
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        requestedBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'inventory_request', entityId: req.id, newValues: JSON.stringify({ requestNumber, title }) },
    });

    return NextResponse.json({ success: true, data: req }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
