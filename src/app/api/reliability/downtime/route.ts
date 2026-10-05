import { NextRequest } from 'next/server';
import { reliabilityEngineeringService } from '@/services/reliabilityEngineering.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError, UnauthorizedError, ForbiddenError, ValidationError } from '@/lib/errors';

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

    if (!assetId) {
      return handleApiError(new ValidationError({ assetId: 'assetId is required' }));
    }

    const analyses = await reliabilityEngineeringService.listDowntimeAnalyses(assetId);
    return Response.json({ success: true, data: analyses });
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

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return handleApiError(new ForbiddenError());
    }

    const body = await request.json();
    const { assetId, periodStart, periodEnd } = body;

    if (!assetId || !periodStart || !periodEnd) {
      const fields: Record<string, string> = {};
      if (!assetId) fields.assetId = 'assetId is required';
      if (!periodStart) fields.periodStart = 'periodStart is required';
      if (!periodEnd) fields.periodEnd = 'periodEnd is required';
      return handleApiError(new ValidationError(fields));
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    if (endDate <= startDate) {
      return handleApiError(new ValidationError({ periodEnd: 'periodEnd must be after periodStart' }));
    }

    const analysis = await reliabilityEngineeringService.computeDowntimeAnalysis(
      assetId, startDate, endDate, session.userId,
    );

    return Response.json({ success: true, data: analysis }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
