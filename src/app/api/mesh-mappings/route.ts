import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser, getSession, hasPermission, isAdmin, type SessionData } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope, type PlantScopeResult } from '@/lib/plant-scope';
import { componentMappingService, type CreateMappingParams } from '@/services/componentMapping.service';

class RouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function loadAuthorizedModel(req: NextRequest, session: SessionData, modelId: string) {
  const plantScope = await getPlantScope(req, session);
  if (plantScope.denyAccess) throw new RouteError(403, 'Access denied');

  const model = await db.modelLibrary.findUnique({
    where: { id: modelId },
    include: { asset: { select: { plantId: true } } },
  });
  if (!model) throw new RouteError(404, 'Model not found');

  const plantId = model.plantId || model.asset?.plantId || null;
  if (!canAccessPlantStrict(plantScope, plantId)) {
    throw new RouteError(403, 'Access denied');
  }
  return { model, plantScope };
}

async function validateComponentTarget(
  mapping: Pick<CreateMappingParams, 'mappingType' | 'targetId'>,
  model: { assetId: string | null },
  plantScope: PlantScopeResult,
) {
  if (mapping.mappingType !== 'component') return;

  const component = await db.componentRegistry.findUnique({
    where: { id: mapping.targetId },
    include: {
      asset: { select: { id: true, plantId: true } },
      twin: {
        select: {
          assetId: true,
          asset: { select: { plantId: true } },
        },
      },
    },
  });
  if (!component) throw new RouteError(404, 'Component target not found');

  const targetPlantId = component.asset?.plantId || component.twin?.asset.plantId || null;
  const targetAssetId = component.assetId || component.twin?.assetId || null;
  if (!canAccessPlantStrict(plantScope, targetPlantId)) {
    throw new RouteError(403, 'Access denied');
  }
  if (model.assetId && targetAssetId !== model.assetId) {
    throw new RouteError(400, 'Component target does not belong to the model asset');
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get('modelId');
    if (!modelId) return NextResponse.json({ error: 'modelId required' }, { status: 400 });

    await loadAuthorizedModel(req, session, modelId);

    const mappingType = searchParams.get('mappingType') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const result = await componentMappingService.listMappings({ modelId, mappingType, search, page, limit });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const status = error instanceof RouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Failed to list mappings';
    console.error('[GET /api/mesh-mappings]', error);
    return NextResponse.json({ error: message }, { status });
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

    const body = await req.json();

    if (body.mappings && Array.isArray(body.mappings)) {
      for (const raw of body.mappings) {
        if (!raw.modelId) throw new RouteError(400, 'modelId required for every mapping');
        const { model, plantScope } = await loadAuthorizedModel(req, session, String(raw.modelId));
        await validateComponentTarget(raw, model, plantScope);
      }
      const result = await componentMappingService.bulkCreateMappings(body.mappings, user.id);
      return NextResponse.json(result, { status: 201 });
    }

    if (!body.modelId) throw new RouteError(400, 'modelId required');
    const { model, plantScope } = await loadAuthorizedModel(req, session, String(body.modelId));
    await validateComponentTarget(body, model, plantScope);

    const mapping = await componentMappingService.createMapping({ ...body, createdById: user.id });
    return NextResponse.json(mapping, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create mapping';
    console.error('[POST /api/mesh-mappings]', error);
    const status = error instanceof RouteError
      ? error.status
      : message.includes('already exists') || message.includes('Conflict')
        ? 409
        : message.includes('Invalid')
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
