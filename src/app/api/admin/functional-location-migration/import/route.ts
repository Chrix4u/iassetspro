import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { importLegacyFunctionalLocations } from '@/lib/functional-location/legacy-migration-service';
import type { LegacyLevelMapping } from '@/lib/functional-location/legacy-migration';

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session)) return NextResponse.json({ success: false, error: 'Administrator access is required' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const body = await request.json() as {
      hierarchySystemId?: string;
      plantId?: string;
      mapping?: LegacyLevelMapping;
      previewFingerprint?: string;
      confirmation?: string;
    };
    const confirmation = String(body.confirmation || '').trim();
    if (confirmation !== 'IMPORT READY LEGACY LOCATIONS') {
      return NextResponse.json({ success: false, error: 'Type IMPORT READY LEGACY LOCATIONS to confirm this migration' }, { status: 400 });
    }
    if (!body.mapping || typeof body.mapping !== 'object') {
      return NextResponse.json({ success: false, error: 'The reviewed legacy field mapping is required' }, { status: 400 });
    }
    const previewFingerprint = String(body.previewFingerprint || '').trim();
    if (!previewFingerprint) {
      return NextResponse.json({ success: false, error: 'Run and review a fresh migration preview first' }, { status: 400 });
    }

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

    const result = await importLegacyFunctionalLocations({
      actorId: session.userId,
      hierarchySystemId: body.hierarchySystemId || null,
      mapping: body.mapping,
      plantIds,
      previewFingerprint,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Legacy functional-location import failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
