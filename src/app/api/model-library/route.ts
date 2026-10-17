import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser, getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { modelPipelineService } from '@/services/modelPipeline.service';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const plantScope = await getPlantScope(req, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || undefined;
    const requestedPlantId = searchParams.get('plantId') || undefined;
    const format = searchParams.get('format') || undefined;
    const status = searchParams.get('status') || undefined;
    const assetId = searchParams.get('assetId') || undefined;

    if (requestedPlantId && !canAccessPlantStrict(plantScope, requestedPlantId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (plantScope.isScoped && requestedPlantId && requestedPlantId !== plantScope.plantId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let effectivePlantId = plantScope.isScoped ? plantScope.plantId || undefined : requestedPlantId;

    if (assetId) {
      const asset = await db.asset.findUnique({ where: { id: assetId }, select: { plantId: true } });
      if (!asset || !canAccessPlantStrict(plantScope, asset.plantId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      if (effectivePlantId && asset.plantId !== effectivePlantId) {
        return NextResponse.json({ error: 'Asset does not belong to the selected plant' }, { status: 400 });
      }
      effectivePlantId = asset.plantId;
    }

    const plantIds = !effectivePlantId && !plantScope.isSystemWide
      ? plantScope.accessiblePlantIds
      : undefined;

    const result = await modelPipelineService.listModels({
      page,
      limit,
      search,
      plantId: effectivePlantId,
      plantIds,
      format,
      status,
      assetId,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list models';
    console.error('[GET /api/model-library]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const plantScope = await getPlantScope(req, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await req.json();
    let effectivePlantId: string | undefined = body.plantId || undefined;

    if (body.assetId) {
      const asset = await db.asset.findUnique({
        where: { id: String(body.assetId) },
        select: { plantId: true },
      });
      if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      if (!canAccessPlantStrict(plantScope, asset.plantId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      if (effectivePlantId && effectivePlantId !== asset.plantId) {
        return NextResponse.json({ error: 'Asset does not belong to the selected plant' }, { status: 400 });
      }
      effectivePlantId = asset.plantId;
    } else if (effectivePlantId) {
      if (!canAccessPlantStrict(plantScope, effectivePlantId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    } else if (plantScope.isScoped && plantScope.plantId) {
      effectivePlantId = plantScope.plantId;
    } else if (!plantScope.isSystemWide) {
      if (plantScope.accessiblePlantIds.length === 1) {
        effectivePlantId = plantScope.accessiblePlantIds[0];
      } else {
        return NextResponse.json({ error: 'Plant ID is required' }, { status: 400 });
      }
    }

    const model = await modelPipelineService.createModelRecord({
      ...body,
      plantId: effectivePlantId,
      uploadedById: user.id,
    });
    return NextResponse.json(model, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create model';
    console.error('[POST /api/model-library]', error);
    const status = message.includes('Invalid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
