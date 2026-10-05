import { NextRequest } from 'next/server';
import { rbiService } from '@/services/reliability/rbi.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError, UnauthorizedError, ForbiddenError, ValidationError } from '@/lib/errors';
import { authorizeAssetPlant, resolveAccessibleAssetIds } from '@/lib/plant-auth-helpers';

// GET /api/reliability/rbi — list assessments or get summary
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return handleApiError(new UnauthorizedError());

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return handleApiError(new ForbiddenError());
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');

    if (view === 'summary') {
      const groupBy = searchParams.get('groupBy') || undefined;
      const assetScope = await resolveAccessibleAssetIds(request, session);
      if (!assetScope.ok) return assetScope.response;
      const summary = await rbiService.getSummary(groupBy, assetScope.entity.assetIds);
      return Response.json({ success: true, data: summary });
    }

    if (view === 'reference') {
      return Response.json({
        success: true,
        data: {
          riskMatrix: rbiService.getRiskMatrixReference(),
          inspectionEffectiveness: rbiService.getInspectionEffectivenessReference(),
          degradationMechanisms: rbiService.getDegradationMechanisms(),
        },
      });
    }

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

    const result = await rbiService.listAssessments({
      assetId: listAssetId,
      assetIds: scopedAssetIds,
      riskCategory: searchParams.get('riskCategory') || undefined,
      corrosionCircuit: searchParams.get('corrosionCircuit') || undefined,
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/reliability/rbi — create assessment
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return handleApiError(new UnauthorizedError());

    if (!isAdmin(session)) {
      return handleApiError(new ForbiddenError('Only admins can create RBI assessments'));
    }

    const body = await request.json();
    const { assetId, equipmentType, corrosionCircuit, operatingConditions, degradationMechanisms,
            probabilityOfFailure, consequenceOfFailure, currentDamageFactor,
            inspectionEffectiveness, thinningRate, currentThickness, minimumThickness, notes } = body;

    if (!assetId) {
      return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
    }
    if (probabilityOfFailure === undefined || consequenceOfFailure === undefined) {
      return handleApiError(new ValidationError({
        probabilityOfFailure: 'probabilityOfFailure is required',
        consequenceOfFailure: 'consequenceOfFailure is required',
      }));
    }

    const plantAuth = await authorizeAssetPlant(request, session, assetId);
    if (!plantAuth.ok) return plantAuth.response;

    const assessment = await rbiService.createAssessment({
      assetId, equipmentType, corrosionCircuit, operatingConditions,
      degradationMechanisms, probabilityOfFailure, consequenceOfFailure,
      currentDamageFactor, inspectionEffectiveness,
      thinningRate, currentThickness, minimumThickness, notes,
      assessedById: session.userId,
    });

    return Response.json({ success: true, data: assessment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
