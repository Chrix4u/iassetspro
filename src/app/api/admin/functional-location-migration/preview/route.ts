import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { previewLegacyFunctionalLocationMigration } from '@/lib/functional-location/legacy-migration-service';
import type { LegacyLevelMapping } from '@/lib/functional-location/legacy-migration';

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session)) return NextResponse.json({ success: false, error: 'Administrator access is required' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const body = await request.json().catch(() => ({})) as {
      hierarchySystemId?: string;
      plantId?: string;
      mapping?: LegacyLevelMapping;
    };
    const requestedPlantId = typeof body.plantId === 'string' && body.plantId.trim() ? body.plantId.trim() : null;
    if (requestedPlantId && !canAccessPlant(plantScope, requestedPlantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const plantIds = requestedPlantId
      ? [requestedPlantId]
      : plantScope.isSystemWide
        ? undefined
        : plantScope.isScoped && plantScope.plantId
          ? [plantScope.plantId]
          : plantScope.accessiblePlantIds;

    const preview = await previewLegacyFunctionalLocationMigration({
      hierarchySystemId: body.hierarchySystemId || null,
      mapping: body.mapping || null,
      plantIds,
    });
    return NextResponse.json({ success: true, data: preview });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Legacy functional-location preview failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
