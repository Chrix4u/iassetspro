import { NextRequest } from 'next/server';
import { reliabilityEngineeringService } from '@/services/reliabilityEngineering.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError, UnauthorizedError, ForbiddenError, ValidationError } from '@/lib/errors';
import { authorizeComponentPlant } from '@/lib/plant-auth-helpers';

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
    const componentId = searchParams.get('componentId');

    if (!componentId) {
      return handleApiError(new ValidationError({ componentId: 'componentId is required' }));
    }

    const plantAuth = await authorizeComponentPlant(request, session, componentId);
    if (!plantAuth.ok) return plantAuth.response;

    const analyses = await reliabilityEngineeringService.listWeibullAnalyses(componentId);
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
    const { componentId } = body;

    if (!componentId) {
      return handleApiError(new ValidationError({ componentId: 'componentId is required' }));
    }

    const plantAuth = await authorizeComponentPlant(request, session, componentId);
    if (!plantAuth.ok) return plantAuth.response;

    const analysis = await reliabilityEngineeringService.runWeibullAnalysis(componentId, session.userId);
    return Response.json({ success: true, data: analysis }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
