import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser, getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { componentMappingService } from '@/services/componentMapping.service';

class RouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function authorizeMapping(req: NextRequest, id: string) {
  const session = getSession(req)!;
  const plantScope = await getPlantScope(req, session);
  if (plantScope.denyAccess) throw new RouteError(403, 'Access denied');

  const mapping = await componentMappingService.getMappingById(id);
  const modelPlantId = mapping.model.plantId || mapping.model.asset?.plantId || null;
  if (!canAccessPlantStrict(plantScope, modelPlantId)) {
    throw new RouteError(403, 'Access denied');
  }
  return { mapping, plantScope };
}

async function validateComponentTarget(
  plantScope: Awaited<ReturnType<typeof getPlantScope>>,
  modelAssetId: string | null,
  mappingType: unknown,
  targetId: unknown,
) {
  if (mappingType !== 'component') return;
  if (typeof targetId !== 'string' || !targetId) throw new RouteError(400, 'Component target ID is required');

  const component = await db.componentRegistry.findUnique({
    where: { id: targetId },
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
  if (!canAccessPlantStrict(plantScope, targetPlantId)) throw new RouteError(403, 'Access denied');
  if (modelAssetId && targetAssetId !== modelAssetId) {
    throw new RouteError(400, 'Component target does not belong to the model asset');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { mapping: existing, plantScope } = await authorizeMapping(req, id);
    const body = await req.json();

    const effectiveMappingType = body.mappingType ?? existing.mappingType;
    const effectiveTargetId = body.targetId ?? existing.targetId;
    await validateComponentTarget(
      plantScope,
      existing.model.assetId,
      effectiveMappingType,
      effectiveTargetId,
    );

    const mapping = await componentMappingService.updateMapping(id, body);
    return NextResponse.json(mapping);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update mapping';
    console.error('[PATCH /api/mesh-mappings/:id]', error);
    const status = error instanceof RouteError ? error.status : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await authorizeMapping(req, id);
    await componentMappingService.deleteMapping(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete mapping';
    console.error('[DELETE /api/mesh-mappings/:id]', error);
    const status = error instanceof RouteError ? error.status : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
