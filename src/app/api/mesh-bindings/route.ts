import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    const assetId = searchParams.get('assetId');

    if (!modelId) {
      return NextResponse.json({ success: false, error: 'modelId query parameter is required' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const model = await db.assetModel.findUnique({
      where: { id: modelId },
      include: { asset: { select: { plantId: true } } },
    });
    if (!model) {
      return NextResponse.json({ success: false, error: 'Asset model not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, model.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = { modelId };

    if (assetId) {
      const asset = await db.asset.findUnique({ where: { id: assetId }, select: { plantId: true } });
      if (!asset || !canAccessPlantStrict(plantScope, asset.plantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      if (asset.plantId !== model.asset.plantId) {
        return NextResponse.json({ success: false, error: 'Bound asset must belong to the model plant' }, { status: 400 });
      }
      where.assetId = assetId;
    }

    const bindings = await db.assetMeshBinding.findMany({
      where,
      include: {
        model: { select: { id: true, name: true, format: true } },
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true, criticality: true } },
      },
      orderBy: { meshName: 'asc' },
    });

    return NextResponse.json({ success: true, data: bindings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load mesh bindings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { modelId, meshName, meshPath, meshType, assetId, colorOverride, opacity, isClickable, isVisible, explodeOffset, metadata } = body;

    if (!modelId) {
      return NextResponse.json({ success: false, error: 'Model ID is required' }, { status: 400 });
    }

    if (!meshName) {
      return NextResponse.json({ success: false, error: 'Mesh name is required' }, { status: 400 });
    }

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'Asset ID is required' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const model = await db.assetModel.findUnique({
      where: { id: modelId },
      include: { asset: { select: { plantId: true } } },
    });
    if (!model) {
      return NextResponse.json({ success: false, error: 'Asset model not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, model.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const asset = await db.asset.findUnique({ where: { id: assetId }, select: { plantId: true } });
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    if (asset.plantId !== model.asset.plantId) {
      return NextResponse.json({ success: false, error: 'Bound asset must belong to the model plant' }, { status: 400 });
    }

    const existing = await db.assetMeshBinding.findFirst({
      where: { modelId, meshName },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: 'A binding for this mesh name already exists on this model' }, { status: 409 });
    }

    const binding = await db.assetMeshBinding.create({
      data: {
        modelId,
        meshName,
        meshPath: meshPath || null,
        meshType: meshType || 'component',
        assetId,
        colorOverride: colorOverride || null,
        opacity: opacity !== undefined ? parseFloat(String(opacity)) : null,
        isClickable: isClickable !== undefined ? isClickable : true,
        isVisible: isVisible !== undefined ? isVisible : true,
        explodeOffset: explodeOffset ? JSON.stringify(explodeOffset) : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
      include: {
        model: { select: { id: true, name: true, format: true } },
        asset: { select: { id: true, name: true, assetTag: true, status: true, condition: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'asset_mesh_binding',
        entityId: binding.id,
        newValues: JSON.stringify({ modelId, meshName, assetId }),
      },
    });

    return NextResponse.json({ success: true, data: binding }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create mesh binding';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
