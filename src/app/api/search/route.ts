import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, hasPermission, hasRole, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { EnterpriseSearchService, type SearchResult } from '@/services/enterpriseSearch.service';

const FULL_INVENTORY_SEARCH_PERMISSIONS = [
  'inventory.view_all',
  'inventory.manage',
  'inventory.stock_in',
  'inventory.stock_out',
  'inventory_locations.view',
  'stock_transactions.view',
  'inventory_adjustments.view',
  'inventory_transfers.view',
  'material_requisitions.view',
  'vendors.view',
  'purchase_orders.view',
];

const GROUP_LABELS: Record<string, string> = {
  assets: 'Assets',
  work_orders: 'Work Orders',
  maintenance_requests: 'Repair Requests',
  components: 'Components',
  inventory: 'Inventory',
  documents: 'Documents',
};

function metadataLabel(result: SearchResult): string | undefined {
  const metadata = result.metadata || {};
  const candidates = [
    metadata.priority,
    metadata.criticality,
    metadata.category,
    metadata.unit,
  ];
  const value = candidates.find(v => typeof v === 'string' && v.trim());
  return typeof value === 'string' ? value : undefined;
}

// GET /api/search — permission- and plant-scoped enterprise search
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

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const admin = isAdmin(session);
    const allowedTypes: string[] = [];

    if (admin || hasAnyPermission(session, ['assets.view', 'assets.view_all', 'assets.view_own'])) {
      allowedTypes.push('assets');
    }
    if (admin || hasAnyPermission(session, ['work_orders.view', 'work_orders.view_all', 'work_orders.view_own'])) {
      allowedTypes.push('work_orders');
    }
    if (admin || hasAnyPermission(session, ['maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.view_own'])) {
      allowedTypes.push('maintenance_requests');
    }
    if (admin || hasAnyPermission(session, FULL_INVENTORY_SEARCH_PERMISSIONS)) {
      allowedTypes.push('inventory');
    }
    if (admin || hasPermission(session, 'documents.view')) {
      allowedTypes.push('documents');
    }
    // Spatial components are not independently plant-scoped in the legacy
    // search service, so expose them only to system-wide asset viewers.
    if (plantScope.isSystemWide && (admin || hasAnyPermission(session, ['assets.view', 'assets.view_all']))) {
      allowedTypes.push('components');
    }

    const requestedTypes = searchParams.get('types')?.split(',').map(v => v.trim()).filter(Boolean);
    const selectedTypes = requestedTypes
      ? requestedTypes.filter(type => allowedTypes.includes(type))
      : allowedTypes;

    const rawLimit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const rawOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    if (selectedTypes.length === 0) {
      return NextResponse.json({
        success: true,
        data: { query: query.trim(), results: [], total: 0, took: 0 },
      });
    }

    const requestedPlantId = searchParams.get('plantId') || undefined;
    let resolvedPlantId = plantScope.isScoped && plantScope.plantId ? plantScope.plantId : undefined;

    if (requestedPlantId) {
      if (!plantScope.isSystemWide && !plantScope.accessiblePlantIds.includes(requestedPlantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      if (resolvedPlantId && resolvedPlantId !== requestedPlantId) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      resolvedPlantId = requestedPlantId;
    }

    const scopedPlantIds = resolvedPlantId || plantScope.isSystemWide
      ? undefined
      : plantScope.accessiblePlantIds;

    const hasBroadWorkOrderView = admin || hasAnyPermission(session, ['work_orders.view', 'work_orders.view_all']);
    const workOrderOwnUserId = !admin && (
      hasRole(session, 'maintenance_technician') ||
      (!hasBroadWorkOrderView && hasPermission(session, 'work_orders.view_own'))
    ) ? session.userId : undefined;

    const hasBroadMaintenanceRequestView = admin || hasAnyPermission(session, [
      'maintenance_requests.view',
      'maintenance_requests.view_all',
    ]);

    let maintenanceRequestRequesterId: string | undefined;
    let maintenanceRequestTechnicianId: string | undefined;
    let maintenanceSupervisorId: string | undefined;
    let maintenanceSupervisorDepartmentIds: string[] | undefined;

    if (!admin && selectedTypes.includes('maintenance_requests')) {
      if (hasRole(session, 'maintenance_technician')) {
        maintenanceRequestTechnicianId = session.userId;
      } else if (hasRole(session, 'maintenance_supervisor') && hasBroadMaintenanceRequestView) {
        maintenanceSupervisorId = session.userId;
        const departments = await db.department.findMany({
          where: { supervisorId: session.userId },
          select: { id: true },
        });
        maintenanceSupervisorDepartmentIds = departments.map(department => department.id);
      } else if (!hasBroadMaintenanceRequestView && hasPermission(session, 'maintenance_requests.view_own')) {
        maintenanceRequestRequesterId = session.userId;
      }
    }

    const searchResult = await EnterpriseSearchService.search({
      query: query.trim(),
      types: selectedTypes,
      limit,
      offset,
      plantId: resolvedPlantId,
      plantIds: scopedPlantIds,
      workOrderOwnUserId,
      maintenanceRequestRequesterId,
      maintenanceRequestTechnicianId,
      maintenanceSupervisorId,
      maintenanceSupervisorDepartmentIds,
    });

    const grouped = new Map<string, {
      type: string;
      label: string;
      count: number;
      results: Array<{
        id: string;
        type: string;
        title: string;
        subtitle: string;
        status?: string;
        meta?: string;
      }>;
    }>();

    for (const result of searchResult.results) {
      const type = result.entityType;
      const group = grouped.get(type) || {
        type,
        label: GROUP_LABELS[type] || type.replace(/_/g, ' '),
        count: 0,
        results: [],
      };
      group.count += 1;
      group.results.push({
        id: result.id,
        type,
        title: result.title,
        subtitle: result.description || '',
        status: typeof result.metadata?.status === 'string' ? result.metadata.status : undefined,
        meta: metadataLabel(result),
      });
      grouped.set(type, group);
    }

    return NextResponse.json({
      success: true,
      data: {
        query: query.trim(),
        results: Array.from(grouped.values()),
        total: searchResult.total,
        took: searchResult.took,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
