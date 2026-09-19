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
    if (!hasPermission(session, 'pm_schedules.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const schedule = await db.pmSchedule.findUnique({
      where: { id },
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true, status: true, criticality: true },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        department: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'PM schedule not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: schedule });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM schedule';
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
    if (!hasPermission(session, 'pm_schedules.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.pmSchedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'PM schedule not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'description', 'frequencyType', 'frequencyValue',
      'lastCompletedDate', 'nextDueDate', 'estimatedDuration', 'priority',
      'assignedToId', 'departmentId', 'isActive', 'autoGenerateWO',
      'leadDays', 'woTypeId',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'lastCompletedDate' || field === 'nextDueDate') {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await db.pmSchedule.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true } },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        department: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'pm_schedule',
        entityId: id,
        oldValues: JSON.stringify({ title: existing.title, frequencyType: existing.frequencyType }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update PM schedule';
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

    if (!hasPermission(session, 'pm_schedules.delete') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.pmSchedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'PM schedule not found' },
        { status: 404 }
      );
    }

    // Soft delete (isActive=false)
    const deactivated = await db.pmSchedule.update({
      where: { id },
      data: { isActive: false },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'pm_schedule',
        entityId: id,
        oldValues: JSON.stringify({ title: existing.title, isActive: existing.isActive }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate PM schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
