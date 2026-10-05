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

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const model = await db.assetModel.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true, serialNumber: true } },
        uploadedBy: { select: { id: true, fullName: true, username: true } },
        bindings: {
          include: {
            asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
          },
          orderBy: { meshName: 'asc' },
        },
      },
    });

    if (!model) {
      return NextResponse.json({ success: false, error: 'Asset model not found' }, { status: 404 });
    }

    const { bindings, ...modelData } = model;
    return NextResponse.json({ success: true, data: { ...modelData, meshBindings: bindings } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load asset model';
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

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.assetModel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Asset model not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['name', 'fileName', 'fileSize', 'fileType', 'filePath', 'format', 'meshCount', 'vertexCount'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'fileSize') {
          updateData[field] = body[field] !== null ? parseInt(String(body[field]), 10) : null;
        } else if (field === 'meshCount' || field === 'vertexCount') {
          updateData[field] = body[field] !== null ? parseInt(String(body[field]), 10) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await db.assetModel.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
        uploadedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'asset_model',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, format: existing.format }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update asset model';
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

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.assetModel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Asset model not found' }, { status: 404 });
    }

    // Delete associated mesh bindings first
    await db.assetMeshBinding.deleteMany({ where: { modelId: id } });

    await db.assetModel.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'asset_model',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, assetId: existing.assetId, filePath: existing.filePath }),
        newValues: JSON.stringify({ deleted: true }),
      },
    });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete asset model';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
