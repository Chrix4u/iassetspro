import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

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

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const scene = await db.digitalTwinScene.findUnique({
      where: { id },
      include: {
        twin: {
          select: { id: true, name: true, type: true, assetId: true, healthScore: true },
          include: {
            asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true, criticality: true, plantId: true } },
          },
        },
        model: {
          select: { id: true, name: true, format: true, filePath: true, fileName: true },
          include: {
            meshBindings: {
              include: {
                asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true, criticality: true } },
              },
              orderBy: { meshName: 'asc' },
            },
          },
        },
        createdBy: { select: { id: true, fullName: true, username: true } },
        hotspots: {
          include: {
            asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        annotations: {
          include: {
            author: { select: { id: true, fullName: true, username: true, avatar: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        cameraPresets: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!scene) {
      return NextResponse.json({ success: false, error: 'Digital twin scene not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, scene.twin.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: scene });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load digital twin scene';
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

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.digitalTwinScene.findUnique({
      where: { id },
      include: {
        twin: { include: { asset: { select: { plantId: true } } } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Digital twin scene not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, existing.twin.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'description', 'modelId', 'sceneType',
      'environment', 'backgroundColor', 'groundPlane',
      'gridEnabled', 'ambientLight', 'directionalLight',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'ambientLight' || field === 'directionalLight') {
          updateData[field] = body[field] !== null ? parseFloat(String(body[field])) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    if (typeof body.modelId === 'string' && body.modelId !== existing.modelId) {
      const model = await db.assetModel.findUnique({
        where: { id: body.modelId },
        include: { asset: { select: { plantId: true } } },
      });
      if (!model) {
        return NextResponse.json({ success: false, error: 'Asset model not found' }, { status: 404 });
      }
      if (!canAccessPlantStrict(plantScope, model.asset.plantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      if (model.assetId !== existing.twin.assetId) {
        return NextResponse.json({ success: false, error: 'Asset model does not belong to the twin asset' }, { status: 400 });
      }
    }

    const updated = await db.digitalTwinScene.update({
      where: { id },
      data: updateData,
      include: {
        twin: { select: { id: true, name: true, type: true } },
        model: { select: { id: true, name: true, format: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        _count: { select: { hotspots: true, annotations: true, cameraPresets: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'digital_twin_scene',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, sceneType: existing.sceneType, modelId: existing.modelId }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update digital twin scene';
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

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.digitalTwinScene.findUnique({
      where: { id },
      include: {
        twin: { include: { asset: { select: { plantId: true } } } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Digital twin scene not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, existing.twin.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Delete child records first (hotspots, annotations, cameraPresets)
    await Promise.all([
      db.twinHotspot.deleteMany({ where: { sceneId: id } }),
      db.twinAnnotation.deleteMany({ where: { sceneId: id } }),
      db.twinCameraPreset.deleteMany({ where: { sceneId: id } }),
    ]);

    await db.digitalTwinScene.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'digital_twin_scene',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, twinId: existing.twinId }),
        newValues: JSON.stringify({ deleted: true }),
      },
    });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete digital twin scene';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
