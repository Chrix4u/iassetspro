import { NextRequest } from 'next/server';
import { degradationService } from '@/services/reliability/degradation.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError, UnauthorizedError, ForbiddenError, ValidationError } from '@/lib/errors';

// GET /api/reliability/degradation — list profiles, get multi-param analysis, or get stage alerts
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return handleApiError(new UnauthorizedError());

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return handleApiError(new ForbiddenError());
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');

    // Multi-parameter degradation analysis
    if (view === 'multi') {
      const assetId = searchParams.get('assetId');
      if (!assetId) {
        return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
      }
      const result = await degradationService.computeMultiParameter(assetId);
      return Response.json({ success: true, data: result });
    }

    // Stage-based alert view
    if (view === 'alerts') {
      const stage = searchParams.get('stage') || undefined;
      const profiles = await degradationService.getProfilesByStage(stage);
      return Response.json({ success: true, data: profiles });
    }

    // Rate change detection
    if (view === 'rate-change') {
      const assetId = searchParams.get('assetId');
      const parameterName = searchParams.get('parameterName');
      if (!assetId || !parameterName) {
        return handleApiError(new ValidationError({
          assetId: 'assetId is required',
          parameterName: 'parameterName is required',
        }));
      }
      const result = await degradationService.detectRateChange(assetId, parameterName);
      return Response.json({ success: true, data: result });
    }

    // Default: list profiles
    const result = await degradationService.listProfiles({
      assetId: searchParams.get('assetId') || undefined,
      degradationStage: searchParams.get('degradationStage') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/reliability/degradation — compute degradation analysis
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return handleApiError(new UnauthorizedError());

    if (!isAdmin(session)) {
      return handleApiError(new ForbiddenError('Only admins can compute degradation analysis'));
    }

    const body = await request.json();
    const { assetId, parameterName, dataPoints, modelType,
            alertThreshold, alarmThreshold, criticalThreshold, unit } = body;

    if (!assetId || !parameterName || !dataPoints?.length) {
      const fields: Record<string, string> = {};
      if (!assetId) fields.assetId = 'assetId is required';
      if (!parameterName) fields.parameterName = 'parameterName is required';
      if (!dataPoints?.length) fields.dataPoints = 'dataPoints array is required';
      return handleApiError(new ValidationError(fields));
    }

    const result = await degradationService.computeDegradation({
      assetId,
      parameterName,
      dataPoints: dataPoints.map((dp: { timestamp: string; value: number }) => ({
        timestamp: new Date(dp.timestamp),
        value: dp.value,
      })),
      modelType,
      alertThreshold,
      alarmThreshold,
      criticalThreshold,
    });

    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
