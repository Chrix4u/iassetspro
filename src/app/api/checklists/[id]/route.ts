import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { canAccessChecklistTargets, validateChecklistTargets } from '@/lib/pm-checklist-scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_checklists.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const { id } = await params;
    const checklist = await db.checklist.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!checklist) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }
    if (!await canAccessChecklistTargets(plantScope, checklist)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: checklist });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load checklist';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_checklists.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.checklist.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }
    if (!await canAccessChecklistTargets(plantScope, existing)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const nextAssetId = body.assetId !== undefined ? body.assetId || null : existing.assetId;
    const nextDepartmentId = body.departmentId !== undefined ? body.departmentId || null : existing.departmentId;
    const targetValidation = await validateChecklistTargets(plantScope, nextAssetId, nextDepartmentId);
    if (!targetValidation.ok) {
      return NextResponse.json(
        { success: false, error: targetValidation.error },
        { status: targetValidation.status },
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['title', 'description', 'type', 'frequency', 'departmentId', 'assetId', 'isActive'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'assetId') updateData[field] = nextAssetId;
        else if (field === 'departmentId') updateData[field] = nextDepartmentId;
        else updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      const updatedChecklist = await tx.checklist.update({
        where: { id },
        data: updateData,
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'checklist',
          entityId: id,
          oldValues: JSON.stringify({
            title: existing.title,
            isActive: existing.isActive,
            assetId: existing.assetId,
            departmentId: existing.departmentId,
          }),
          newValues: JSON.stringify(updateData),
        },
      });

      return updatedChecklist;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update checklist';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_checklists.delete') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.checklist.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }
    if (!await canAccessChecklistTargets(plantScope, existing)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    await db.$transaction(async (tx) => {
      await tx.checklist.update({
        where: { id },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'delete',
          entityType: 'checklist',
          entityId: id,
          oldValues: JSON.stringify({
            title: existing.title,
            assetId: existing.assetId,
            departmentId: existing.departmentId,
            isActive: existing.isActive,
          }),
          newValues: JSON.stringify({ isActive: false }),
        },
      });
    });

    return NextResponse.json({ success: true, message: 'Checklist deactivated' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete checklist';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
