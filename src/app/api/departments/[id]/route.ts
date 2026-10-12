import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import {
  getMaintenanceApproverEligibility,
  maintenanceApproverErrorMessage,
} from '@/lib/maintenance-approvers';

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

    const department = await db.department.findUnique({
      where: { id },
      include: {
        supervisor: { select: { id: true, fullName: true, username: true } },
        parent: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
        children: {
          include: {
            supervisor: { select: { id: true, fullName: true, username: true } },
            _count: { select: { children: true } },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: department });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load department';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['name', 'code', 'plantId', 'parentId', 'supervisorId'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === '' ? null : body[field];
      }
    }

    if (updateData.parentId === id) {
      return NextResponse.json(
        { success: false, error: 'Department cannot be its own parent' },
        { status: 400 }
      );
    }

    const effectivePlantId = typeof updateData.plantId === 'string'
      ? updateData.plantId
      : existing.plantId;
    const effectiveSupervisorId = updateData.supervisorId !== undefined
      ? (typeof updateData.supervisorId === 'string' ? updateData.supervisorId : null)
      : existing.supervisorId;

    if (effectiveSupervisorId) {
      const eligibility = await getMaintenanceApproverEligibility(effectiveSupervisorId, effectivePlantId);
      if (!eligibility.eligible) {
        return NextResponse.json(
          { success: false, error: maintenanceApproverErrorMessage(eligibility.reason) },
          { status: 400 },
        );
      }
    }

    const updated = await db.department.update({
      where: { id },
      data: updateData,
      include: {
        supervisor: { select: { id: true, fullName: true, username: true } },
        parent: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'department',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, code: existing.code }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update department';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.department.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    if (existing._count.children > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete department with child departments' },
        { status: 400 }
      );
    }

    await db.department.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'department',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, code: existing.code }),
      },
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete department';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
