import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const workCenter = await db.workCenter.findUnique({
      where: { id },
    });

    if (!workCenter) {
      return NextResponse.json(
        { success: false, error: 'Work center not found' },
        { status: 404 }
      );
    }

    // Note: WorkCenter model has no plantId field — plant-scope IDOR check not applicable

    return NextResponse.json({ success: true, data: workCenter });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work center';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_centers.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.workCenter.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Work center not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'description', 'type', 'status', 'location',
      'capacity', 'capacityUnit', 'isActive',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }
    if ('name' in updateData) {
      if (typeof updateData.name !== 'string' || !updateData.name.trim()) {
        return NextResponse.json({ success: false, error: 'Work center name is required' }, { status: 400 });
      }
      updateData.name = updateData.name.trim();
    }
    if ('type' in updateData && !['production', 'assembly', 'packaging', 'testing'].includes(String(updateData.type))) {
      return NextResponse.json({ success: false, error: 'Invalid work center type' }, { status: 400 });
    }
    if ('status' in updateData && !['active', 'inactive', 'maintenance'].includes(String(updateData.status))) {
      return NextResponse.json({ success: false, error: 'Invalid work center status' }, { status: 400 });
    }
    if ('capacity' in updateData) {
      const raw = updateData.capacity;
      const capacity = raw === null || raw === '' ? null : Number(raw);
      if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
        return NextResponse.json({ success: false, error: 'Capacity must be a nonnegative whole number' }, { status: 400 });
      }
      updateData.capacity = capacity;
    }

    const updated = await db.workCenter.update({
      where: { id },
      data: updateData,
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'work_center',
        entityId: id,
        oldValues: JSON.stringify({ code: existing.code, status: existing.status }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update work center';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!session.roles.includes('admin')) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.workCenter.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Work center not found' },
        { status: 404 }
      );
    }

    // Soft delete
    const deactivated = await db.workCenter.update({
      where: { id },
      data: { isActive: false },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'work_center',
        entityId: id,
        oldValues: JSON.stringify({ code: existing.code, isActive: existing.isActive }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete work center';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
