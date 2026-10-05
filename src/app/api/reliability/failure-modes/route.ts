import { NextRequest } from 'next/server';
import { reliabilityEngineeringService } from '@/services/reliabilityEngineering.service';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { UnauthorizedError, ForbiddenError, ValidationError } from '@/lib/errors';

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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const category = searchParams.get('category') || undefined;
    const severity = searchParams.get('severity') || undefined;
    const search = searchParams.get('search') || undefined;
    const isActive = searchParams.get('isActive') === 'true' ? true
      : searchParams.get('isActive') === 'false' ? false
      : undefined;

    const result = await reliabilityEngineeringService.listFailureModes({
      page, limit, category, severity, search, isActive,
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
      return handleApiError(new ForbiddenError('Only admins can create failure modes'));
    }

    const body = await request.json();
    const { name, code, description, category, severity, detectionMethod, iso14224Code } = body;

    if (!name || !category) {
      const fields: Record<string, string> = {};
      if (!name) fields.name = 'Name is required';
      if (!category) fields.category = 'Category is required';
      return handleApiError(new ValidationError(fields));
    }

    const failureMode = await reliabilityEngineeringService.createFailureMode({
      name, code, description, category, severity,
      detectionMethod, iso14224Code,
      createdById: session.userId,
    });

    return Response.json({ success: true, data: failureMode }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
