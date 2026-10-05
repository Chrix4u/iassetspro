import { NextRequest } from 'next/server';
import { lifecycleForecastService } from '@/services/reliability/lifecycleForecast.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError, UnauthorizedError, ForbiddenError, ValidationError } from '@/lib/errors';
import { authorizeAssetPlant, resolveAccessibleAssetIds } from '@/lib/plant-auth-helpers';
import { canAccessPlantStrict } from '@/lib/plant-scope';

// GET /api/reliability/lifecycle — list forecasts, maintenance cost forecast, replacement analysis, or CAPEX plan
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return handleApiError(new UnauthorizedError());

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return handleApiError(new ForbiddenError());
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');

    // Maintenance cost forecast
    if (view === 'maintenance-cost') {
      const assetId = searchParams.get('assetId');
      if (!assetId) {
        return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
      }
      const plantAuth = await authorizeAssetPlant(request, session, assetId);
      if (!plantAuth.ok) return plantAuth.response;
      const period = parseInt(searchParams.get('periodMonths') || '12');
      const result = await lifecycleForecastService.forecastMaintenanceCosts(assetId, period);
      return Response.json({ success: true, data: result });
    }

    // Replacement analysis
    if (view === 'replacement') {
      const assetId = searchParams.get('assetId');
      const replacementCost = searchParams.get('replacementCost');
      if (!assetId) {
        return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
      }
      const plantAuth = await authorizeAssetPlant(request, session, assetId);
      if (!plantAuth.ok) return plantAuth.response;
      const result = await lifecycleForecastService.analyzeReplacement(
        assetId,
        replacementCost ? parseFloat(replacementCost) : undefined,
      );
      return Response.json({ success: true, data: result });
    }

    // Health trajectory
    if (view === 'health-trajectory') {
      const assetId = searchParams.get('assetId');
      if (!assetId) {
        return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
      }
      const plantAuth = await authorizeAssetPlant(request, session, assetId);
      if (!plantAuth.ok) return plantAuth.response;
      const period = parseInt(searchParams.get('periodMonths') || '36');
      const trajectory = await lifecycleForecastService.predictHealthTrajectory(assetId, period, session.userId);
      return Response.json({ success: true, data: trajectory });
    }

    // CAPEX planning
    if (view === 'capex') {
      const plantId = searchParams.get('plantId') || undefined;
      const assetScope = await resolveAccessibleAssetIds(request, session);
      if (!assetScope.ok) return assetScope.response;
      if (plantId && !canAccessPlantStrict(assetScope.plantScope, plantId)) {
        return handleApiError(new ForbiddenError('Plant access denied'));
      }
      const result = await lifecycleForecastService.capexPlanning(
        plantId,
        plantId ? undefined : assetScope.entity.assetIds,
      );
      return Response.json({ success: true, data: result });
    }

    // Default: list forecasts
    const listAssetId = searchParams.get('assetId') || undefined;
    let scopedAssetIds: string[] | undefined;
    if (listAssetId) {
      const plantAuth = await authorizeAssetPlant(request, session, listAssetId);
      if (!plantAuth.ok) return plantAuth.response;
    } else {
      const assetScope = await resolveAccessibleAssetIds(request, session);
      if (!assetScope.ok) return assetScope.response;
      scopedAssetIds = assetScope.entity.assetIds ?? undefined;
    }
    const result = await lifecycleForecastService.listForecasts({
      assetId: listAssetId,
      assetIds: scopedAssetIds,
      forecastType: searchParams.get('forecastType') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/reliability/lifecycle — compute TCO
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return handleApiError(new UnauthorizedError());

    if (!isAdmin(session)) {
      return handleApiError(new ForbiddenError('Only admins can compute lifecycle forecasts'));
    }

    const body = await request.json();
    const { assetId, forecastPeriodMonths, acquisitionCost, annualOperatingCost,
            annualMaintenanceCost, disposalCost, discountRate, expectedLifeYears } = body;

    if (!assetId) {
      return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
    }

    const plantAuth = await authorizeAssetPlant(request, session, assetId);
    if (!plantAuth.ok) return plantAuth.response;

    const result = await lifecycleForecastService.computeTCO({
      assetId,
      createdById: session.userId,
      forecastPeriodMonths,
      acquisitionCost,
      annualOperatingCost,
      annualMaintenanceCost,
      disposalCost,
      discountRate,
      expectedLifeYears,
    });

    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
