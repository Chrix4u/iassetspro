import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { canAccessPurchaseOrderLines } from '@/lib/purchase-order-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['inventory.view_all', 'inventory.manage', 'inventory.update', 'inventory.stock_in', 'inventory.stock_out', 'inventory.export']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const po = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, name: true, itemCode: true, plantId: true } } } },
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
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPurchaseOrderLines(plantScope, po.items)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
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
    if (!hasPermission(session, 'inventory.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: { include: { item: { select: { plantId: true } } } } },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPurchaseOrderLines(plantScope, existing.items)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

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
