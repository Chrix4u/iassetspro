import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildSearchAccessContext } from '@/lib/search-access';
import { EnterpriseSearchService } from '@/services/enterpriseSearch.service';

// GET /api/search — global enterprise search
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ success: false, error: 'Search query must be at least 2 characters' }, { status: 400 });
    }

    const access = await buildSearchAccessContext(request, session);
    if (access.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const requestedTypes = searchParams.get('types')?.split(',').map((value) => value.trim()).filter(Boolean);
    const types = requestedTypes
      ? requestedTypes.filter((type) => access.allowedTypes.includes(type))
      : access.allowedTypes;

    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    let plantIds = access.plantIds;
    const requestedPlantId = searchParams.get('plantId') || undefined;
    if (requestedPlantId) {
      if (access.plantIds !== undefined && !access.plantIds.includes(requestedPlantId)) {
        return NextResponse.json({ success: false, error: 'Access denied for selected plant' }, { status: 403 });
      }
      plantIds = [requestedPlantId];
    }

    const results = await EnterpriseSearchService.search({
      query: query.trim(),
      types,
      limit,
      offset,
      plantIds,
      userId: access.userId,
      workOrderOwnOnly: access.workOrderOwnOnly,
      maintenanceRequestMode: access.maintenanceRequestMode,
      supervisedDepartmentIds: access.supervisedDepartmentIds,
    });

    // Keep the enterprise-search flat result contract intact for API callers,
    // and expose a separate grouped projection for the Global Search UI.
    const groupLabels: Record<string, string> = {
      assets: 'Assets',
      work_orders: 'Work Orders',
      maintenance_requests: 'Maintenance Requests',
      inventory: 'Inventory',
    };
    const grouped = new Map<string, Array<{
      id: string;
      type: string;
      title: string;
      subtitle: string;
      status?: string;
      meta?: string;
    }>>();

    for (const result of results.results) {
      if (!groupLabels[result.entityType]) continue;

      const metadata = result.metadata ?? {};
      const status = typeof metadata.status === 'string' ? metadata.status : undefined;
      let meta: string | undefined;

      if (result.entityType === 'assets' && typeof metadata.assetTag === 'string') {
        meta = metadata.assetTag;
      } else if (
        (result.entityType === 'work_orders' || result.entityType === 'maintenance_requests')
        && typeof metadata.priority === 'string'
      ) {
        meta = metadata.priority.replace(/_/g, ' ');
      } else if (result.entityType === 'inventory') {
        const quantity = typeof metadata.quantity === 'number' ? metadata.quantity : undefined;
        const unit = typeof metadata.unit === 'string' ? metadata.unit : undefined;
        if (quantity !== undefined) meta = unit ? `${quantity} ${unit}` : String(quantity);
      }

      const items = grouped.get(result.entityType) ?? [];
      items.push({
        id: result.id,
        type: result.entityType,
        title: result.title,
        subtitle: result.description ?? '',
        status,
        meta,
      });
      grouped.set(result.entityType, items);
    }

    const groups = [...grouped.entries()].map(([type, items]) => ({
      type,
      label: groupLabels[type],
      count: items.length,
      results: items,
    }));

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        query: query.trim(),
        groups,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
