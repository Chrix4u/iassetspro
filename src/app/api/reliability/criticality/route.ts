import { NextRequest } from 'next/server';
import { getPlantScope, getPlantFilterWhere, canAccessPlantStrict } from '@/lib/plant-scope';
import { reliabilityEngineeringService } from '@/services/reliabilityEngineering.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError, UnauthorizedError, ForbiddenError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return handleApiError(new UnauthorizedError());
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return handleApiError(new ForbiddenError());
    }

    const { searchParams } = new URL(request.url);
    const plantId = searchParams.get('plantId') || undefined;

    const scope = await getPlantScope(request, session);
    if (scope.denyAccess || (plantId && !canAccessPlantStrict(scope, plantId))) return handleApiError(new ForbiddenError());
    const result = await reliabilityEngineeringService.getAssetCriticalityRanking(plantId, getPlantFilterWhere(scope));
    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
