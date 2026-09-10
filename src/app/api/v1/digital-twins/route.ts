import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, parsePagination, paginatedResponse } from '@/lib/middleware';
import { handleApiError } from '@/lib/errors';
import { requireFields } from '@/lib/validation';
import { digitalTwinService } from '@/services/digitalTwin.service';

// ============================================================================
// API v1 — Digital Twins (Enterprise Architecture)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission(request, 'digital_twin.view');
    void session; // session available for audit trail

    const { searchParams } = new URL(request.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get('search') || undefined;
    const plantId = searchParams.get('plantId') || undefined;
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

    const result = await digitalTwinService.listTwins({
      page,
      limit,
      search,
      plantId,
      isActive,
    });

    return NextResponse.json(paginatedResponse(result.data as unknown[], result.total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission(request, 'digital_twin.manage');
    const body = await request.json();

    // Validate required fields
    const validationErrors = requireFields(body, ['assetId', 'name']);
    if (validationErrors) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { fields: validationErrors } } },
        { status: 400 }
      );
    }

    const twin = await digitalTwinService.createTwin({
      assetId: body.assetId,
      name: body.name,
      description: body.description,
      type: body.type || 'other',
      parameters: body.parameters,
      connections: body.connections,
      syncInterval: body.syncInterval || '5min',
      createdById: session.userId,
    });

    return NextResponse.json(twin, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
