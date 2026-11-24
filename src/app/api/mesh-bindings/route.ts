import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { isPrivateSmartAnatomyModel, reviewedCadMappingsAreFrozen } from '@/lib/smart-anatomy/reviewed-model';
import { CadMappingFrozenError, CadMappingConflictError, writeCadBindingUnderModelLock } from '@/lib/smart-anatomy/private-cad-mapping-lock';

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
        component: { select: { id: true, componentCode: true, name: true, componentType: true, assetId: true } },
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
    const { modelId, meshName, meshPath, meshType, assetId, componentId, colorOverride, opacity, isClickable, isVisible, explodeOffset, metadata } = body;

    if (!modelId) {
      return NextResponse.json({ success: false, error: 'Model ID is required' }, { status: 400 });
    }

    if (!meshName) {
      return NextResponse.json({ success: false, error: 'Mesh name is required' }, { status: 400 });
    }
    if (typeof meshName !== 'string' || meshName.length > 600 ||
      (meshPath != null && (typeof meshPath !== 'string' || !meshPath.trim() || meshPath.length > 600))) {
      return NextResponse.json({ success: false, error: 'Valid CAD mesh name/path (up to 600 characters) required' }, { status: 400 });
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
    if (await reviewedCadMappingsAreFrozen(model)) {
      return NextResponse.json({
        success: false,
        error: 'Approved or withdrawn CAD mappings are immutable. Import and review a new revision.',
      }, { status: 409 });
    }
    // A protected source CAD file documents one installed machine. Unlike
    // legacy plant-wide scenes, it may not silently target other machines
    // even when both machines belong to the same plant.
    if (isPrivateSmartAnatomyModel(model) && model.assetId !== assetId) {
      return NextResponse.json({
        success: false,
        error: 'Private CAD mesh mapping must belong to the source machine asset',
      }, { status: 400 });
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

    if (componentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: componentId },
        select: { id: true, assetId: true },
      });
      if (!component) {
        return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
      }
      if (component.assetId !== assetId) {
        return NextResponse.json({ success: false, error: 'Bound component must belong to the selected machine asset' }, { status: 400 });
      }
    }

    const existing = await db.assetMeshBinding.findFirst({
      where: { modelId, OR: [
        { meshName },
        ...(meshPath ? [{ meshPath }] : []),
      ] },
    });
    if (existing) {
      return NextResponse.json({ success: false,
        error: 'A binding for this CAD name or exact source path already exists on this model' }, { status: 409 });
    }

    const binding = await writeCadBindingUnderModelLock(model, async tx => {
      const latest = await tx.assetMeshBinding.findFirst({
        where: { modelId, OR: [
          { meshName },
          ...(meshPath ? [{ meshPath }] : []),
        ] },
        select: { id: true },
      });
      if (latest) throw new CadMappingConflictError('CAD name or exact source path already belongs to another binding');
      const created = await tx.assetMeshBinding.create({
      data: {
        modelId,
        meshName,
        meshPath: meshPath || null,
        meshType: meshType || 'component',
        assetId,
        componentId: componentId || null,
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
        component: { select: { id: true, componentCode: true, name: true, componentType: true, assetId: true } },
      },
    });

      await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'asset_mesh_binding',
        entityId: created.id,
        newValues: JSON.stringify({ modelId, meshName, assetId, componentId: componentId || null }),
      },
    });

      return created;
    });

    return NextResponse.json({ success: true, data: binding }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create mesh binding';
    const status = error instanceof CadMappingFrozenError || error instanceof CadMappingConflictError ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
