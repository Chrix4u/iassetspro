import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const req = await db.inventoryRequest.findUnique({
      where: { id },
      include: {
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!req) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: req });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load request';
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
    if (!hasPermission(session, 'material_requisitions.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const existing = await db.inventoryRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    if (body.status !== undefined) {
      return NextResponse.json(
        { success: false, error: 'Request status must be changed through the approval or rejection workflow' },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    for (const field of ['title', 'description', 'priority', 'notes']) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const updated = await db.inventoryRequest.update({
      where: { id },
      data: updateData,
      include: {
        items: { include: { item: { select: { id: true, name: true, itemCode: true } } } },
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'update', entityType: 'inventory_request', entityId: id, oldValues: JSON.stringify({ status: existing.status }), newValues: JSON.stringify(updateData) },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
