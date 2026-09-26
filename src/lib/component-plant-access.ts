import type { NextRequest } from 'next/server';
import type { SessionData } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';

export type ComponentPlantAccess =
  | { exists: false; allowed: false }
  | { exists: true; allowed: false }
  | { exists: true; allowed: true };

export async function getComponentPlantAccess(
  request: NextRequest,
  session: SessionData,
  componentId: string,
): Promise<ComponentPlantAccess> {
  const component = await db.componentRegistry.findUnique({
    where: { id: componentId },
    select: { id: true, asset: { select: { plantId: true } } },
  });

  if (!component) {
    return { exists: false, allowed: false };
  }

  const plantScope = await getPlantScope(request, session);
  return {
    exists: true,
    allowed: canAccessPlant(plantScope, component.asset?.plantId),
  };
}
