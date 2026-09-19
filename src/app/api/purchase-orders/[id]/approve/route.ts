import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'purchase_orders.approve') && !hasPermission(session, 'purchase_orders.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    if (!['draft', 'submitted'].includes(existing.status)) return NextResponse.json({ success: false, error: 'Only draft/submitted POs can be approved' }, { status: 400 });

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: 'approved', approvedById: session.userId, approvedAt: new Date(), notes: body.notes ? (existing.notes ? `${existing.notes}\n[Approved]: ${body.notes}` : `[Approved]: ${body.notes}`) : existing.notes },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'update', entityType: 'purchase_order', entityId: id, oldValues: JSON.stringify({ status: existing.status }), newValues: JSON.stringify({ status: 'approved' }) },
    });

    // Notify the PO creator
    if (existing.createdById && existing.createdById !== session.userId) {
      await notifyUser(
        existing.createdById,
        'po_approved',
        'Purchase Order Approved',
        `PO ${existing.poNumber} has been approved`,
        'purchase_order',
        id,
        'purchase-orders',
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve purchase order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
