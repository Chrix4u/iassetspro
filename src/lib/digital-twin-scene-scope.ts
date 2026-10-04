import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import type { SessionData } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export class DigitalTwinScopeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAuthorizedScene(
  request: NextRequest,
  session: SessionData,
  sceneId: string,
) {
  const plantScope = await getPlantScope(request, session);
  if (plantScope.denyAccess) {
    throw new DigitalTwinScopeError(403, 'Access denied');
  }

  const scene = await db.digitalTwinScene.findUnique({
    where: { id: sceneId },
    include: {
      twin: {
        include: {
          asset: { select: { id: true, plantId: true } },
        },
      },
      model: { select: { id: true, assetId: true } },
    },
  });
  if (!scene) throw new DigitalTwinScopeError(404, 'Scene not found');

  if (!canAccessPlantStrict(plantScope, scene.twin.asset.plantId)) {
    throw new DigitalTwinScopeError(403, 'Access denied');
  }

  return { scene, plantScope };
}

export async function requireSceneAsset(
  assetId: string,
  scenePlantId: string,
  plantScope: Awaited<ReturnType<typeof getPlantScope>>,
) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, plantId: true },
  });
  if (!asset) throw new DigitalTwinScopeError(404, 'Asset not found');
  if (!canAccessPlantStrict(plantScope, asset.plantId)) {
    throw new DigitalTwinScopeError(403, 'Access denied');
  }
  if (asset.plantId !== scenePlantId) {
    throw new DigitalTwinScopeError(400, 'Asset must belong to the scene plant');
  }
  return asset;
}

export function digitalTwinScopeStatus(error: unknown): number {
  return error instanceof DigitalTwinScopeError ? error.status : 500;
}
