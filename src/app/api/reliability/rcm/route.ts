import { NextRequest } from 'next/server';
import { reliabilityEngineeringService } from '@/services/reliabilityEngineering.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError, UnauthorizedError, ForbiddenError, ValidationError } from '@/lib/errors';
import { authorizeAssetPlant } from '@/lib/plant-auth-helpers';

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
    const assetId = searchParams.get('assetId');
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!assetId) {
      return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
    }

    const plantAuth = await authorizeAssetPlant(request, session, assetId);
    if (!plantAuth.ok) return plantAuth.response;

    const result = await reliabilityEngineeringService.listRcmAnalyses({
      assetId, status, page, limit,
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return handleApiError(new UnauthorizedError());
    }

    if (!isAdmin(session)) {
      return handleApiError(new ForbiddenError('Only admins can create RCM analyses'));
    }

    const body = await request.json();
    const { assetId, name, description, methodology, analysisDate, nextReviewDate, resultSummary, riskMatrix } = body;

    if (!assetId || !name) {
      const fields: Record<string, string> = {};
      if (!assetId) fields.assetId = 'assetId is required';
      if (!name) fields.name = 'name is required';
      return handleApiError(new ValidationError(fields));
    }

    const plantAuth = await authorizeAssetPlant(request, session, assetId);
    if (!plantAuth.ok) return plantAuth.response;

    const analysis = await reliabilityEngineeringService.createRcmAnalysis({
      assetId, name, description, methodology,
      analysisDate, nextReviewDate, resultSummary, riskMatrix,
      createdById: session.userId,
    });

    return Response.json({ success: true, data: analysis }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
