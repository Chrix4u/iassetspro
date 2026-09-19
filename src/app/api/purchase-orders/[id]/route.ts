import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, hasAnyPermission, isAdmin } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasAnyPermission(session, [
      'purchase_orders.view', 'purchase_orders.update', 'purchase_orders.approve',
      'purchase_orders.receive', 'purchase_orders.manage',
    ])) {
      return NextResponse.json({ success: false, error: 'Insufficient purchase order permissions' }, { status: 403 });
    }

    const { id } = await params;
    const po = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        receivingRecords: {
          include: {
            item: { select: { id: true, name: true, itemCode: true } },
            receivedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!po) return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: po });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load purchase order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'purchase_orders.update') && !hasPermission(session, 'purchase_orders.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    for (const field of ['priority', 'notes', 'status', 'expectedDelivery']) {
      if (body[field] !== undefined) {
        updateData[field] = field === 'expectedDelivery' ? (body[field] ? new Date(body[field]) : null) : body[field];
      }
    }

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'update', entityType: 'purchase_order', entityId: id, oldValues: JSON.stringify({ status: existing.status }), newValues: JSON.stringify(updateData) },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update purchase order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
