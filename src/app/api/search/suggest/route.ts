import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildSearchAccessContext } from '@/lib/search-access';
import { EnterpriseSearchService } from '@/services/enterpriseSearch.service';

// GET /api/search/suggest — autocomplete suggestions
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '5', 10);

    if (!query || query.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const access = await buildSearchAccessContext(request, session);
    if (access.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const results = await EnterpriseSearchService.search({
      query,
      types: access.allowedTypes,
      limit: Math.min(Math.max(limit || 5, 1), 10),
      offset: 0,
      plantIds: access.plantIds,
      userId: access.userId,
      workOrderOwnOnly: access.workOrderOwnOnly,
      maintenanceRequestMode: access.maintenanceRequestMode,
      supervisedDepartmentIds: access.supervisedDepartmentIds,
    });

    const suggestions = results.results.map((result) => ({
      text: result.title,
      type: result.entityType,
      count: 1,
    }));

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: 'Search suggestions failed' }, { status: 500 });
  }
}
