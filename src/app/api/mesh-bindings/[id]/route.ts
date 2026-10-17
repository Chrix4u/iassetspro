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

    const binding = await db.assetMeshBinding.findUnique({
      where: { id },
      include: {
        model: {
          select: { id: true, name: true, format: true, assetId: true },
          include: {
            asset: { select: { id: true, name: true, assetTag: true, status: true, plantId: true } },
          },
        },
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true, criticality: true, location: true, plantId: true } },
      },
    });

    if (!binding) {
      return NextResponse.json({ success: false, error: 'Mesh binding not found' }, { status: 404 });
    }
    if (
      !canAccessPlantStrict(plantScope, binding.model.asset.plantId)
      || !canAccessPlantStrict(plantScope, binding.asset.plantId)
      || binding.asset.plantId !== binding.model.asset.plantId
    ) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Get IoT device readings for the bound asset only after authorization.
    const iotDevices = await db.iotDevice.findMany({
      where: { assetId: binding.assetId, isActive: true },
      select: {
        id: true,
        name: true,
        deviceCode: true,
        parameter: true,
        unit: true,
        status: true,
        lastReading: true,
        lastSeen: true,
        thresholdMin: true,
        thresholdMax: true,
      },
      take: 10,
    });

    return NextResponse.json({ success: true, data: { ...binding, iotDevices } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load mesh binding';
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

    const existing = await db.assetMeshBinding.findUnique({
      where: { id },
      include: {
        model: { include: { asset: { select: { plantId: true } } } },
        asset: { select: { plantId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Mesh binding not found' }, { status: 404 });
    }
    if (
      !canAccessPlantStrict(plantScope, existing.model.asset.plantId)
      || !canAccessPlantStrict(plantScope, existing.asset.plantId)
      || existing.asset.plantId !== existing.model.asset.plantId
    ) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['meshName', 'meshPath', 'meshType', 'assetId', 'colorOverride', 'opacity', 'isClickable', 'isVisible', 'explodeOffset', 'metadata'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'opacity') {
          updateData[field] = body[field] !== null ? parseFloat(String(body[field])) : null;
        } else if (field === 'explodeOffset' || field === 'metadata') {
          updateData[field] = body[field] !== null ? JSON.stringify(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    if (updateData.meshName && updateData.meshName !== existing.meshName) {
      const duplicate = await db.assetMeshBinding.findFirst({
        where: { modelId: existing.modelId, meshName: updateData.meshName as string },
      });
      if (duplicate) {
        return NextResponse.json({ success: false, error: 'A binding for this mesh name already exists on this model' }, { status: 409 });
      }
    }

    if (updateData.assetId) {
      const asset = await db.asset.findUnique({
        where: { id: updateData.assetId as string },
        select: { plantId: true },
      });
      if (!asset) {
        return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
      }
      if (!canAccessPlantStrict(plantScope, asset.plantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      if (asset.plantId !== existing.model.asset.plantId) {
        return NextResponse.json({ success: false, error: 'Bound asset must belong to the model plant' }, { status: 400 });
      }
    }

    const updated = await db.assetMeshBinding.update({
      where: { id },
      data: updateData,
      include: {
        model: { select: { id: true, name: true, format: true } },
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'asset_mesh_binding',
        entityId: id,
        oldValues: JSON.stringify({ meshName: existing.meshName, assetId: existing.assetId }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update mesh binding';
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

    const existing = await db.assetMeshBinding.findUnique({
      where: { id },
      include: {
        model: { include: { asset: { select: { plantId: true } } } },
        asset: { select: { plantId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Mesh binding not found' }, { status: 404 });
    }
    if (
      !canAccessPlantStrict(plantScope, existing.model.asset.plantId)
      || !canAccessPlantStrict(plantScope, existing.asset.plantId)
      || existing.asset.plantId !== existing.model.asset.plantId
    ) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    await db.assetMeshBinding.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'asset_mesh_binding',
        entityId: id,
        oldValues: JSON.stringify({ meshName: existing.meshName, assetId: existing.assetId, modelId: existing.modelId }),
        newValues: JSON.stringify({ deleted: true }),
      },
    });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete mesh binding';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
