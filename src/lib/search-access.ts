import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  hasAnyPermission,
  hasPermission,
  isAdmin,
  type SessionData,
} from '@/lib/auth';
import { buildOperationalModuleSet } from '@/lib/module-access';
import { getPlantScope } from '@/lib/plant-scope';

export type MaintenanceRequestSearchMode = 'all' | 'own' | 'supervisor' | 'technician';

export interface SearchAccessContext {
  denyAccess: boolean;
  allowedTypes: string[];
  plantIds?: string[];
  userId: string;
  workOrderOwnOnly: boolean;
  maintenanceRequestMode: MaintenanceRequestSearchMode;
  supervisedDepartmentIds: string[];
}

export async function buildSearchAccessContext(
  request: NextRequest,
  session: SessionData,
): Promise<SearchAccessContext> {
  const plantScope = await getPlantScope(request, session);
  if (plantScope.denyAccess) {
    return {
      denyAccess: true,
      allowedTypes: [],
      plantIds: [],
      userId: session.userId,
      workOrderOwnOnly: true,
      maintenanceRequestMode: 'own',
      supervisedDepartmentIds: [],
    };
  }

  const moduleRows = await db.systemModule.findMany({
    where: {
      code: {
        in: ['assets', 'work_orders', 'maintenance_requests', 'inventory', 'documents'],
      },
    },
    include: { companyModules: true },
  });
  const operationalModules = buildOperationalModuleSet(moduleRows);
  const admin = isAdmin(session);

  const allowedTypes: string[] = [];

  const canSearchAssets = operationalModules.has('assets')
    && (admin || hasAnyPermission(session, ['assets.view', 'assets.view_all']));
  if (canSearchAssets) {
    allowedTypes.push('assets');
    // Spatial nodes have no direct plantId. Only system-wide users may search
    // them until a plant-safe hierarchy relation is available.
    if (plantScope.isSystemWide) allowedTypes.push('components');
  }

  const canSearchWorkOrders = operationalModules.has('work_orders')
    && (admin || hasAnyPermission(session, [
      'work_orders.view',
      'work_orders.view_all',
      'work_orders.view_own',
    ]));
  if (canSearchWorkOrders) allowedTypes.push('work_orders');

  const canSearchRequests = operationalModules.has('maintenance_requests')
    && (admin || hasAnyPermission(session, [
      'maintenance_requests.view',
      'maintenance_requests.view_all',
      'maintenance_requests.view_own',
    ]));
  if (canSearchRequests) allowedTypes.push('maintenance_requests');

  const canSearchInventory = operationalModules.has('inventory')
    && (admin || hasAnyPermission(session, [
      'inventory.view_all',
      'inventory.manage',
      'inventory.create',
      'inventory.update',
      'inventory.stock_in',
      'inventory.stock_out',
      'inventory.reserve',
      'inventory.export',
    ]));
  if (canSearchInventory) allowedTypes.push('inventory');

  const canSearchDocuments = operationalModules.has('documents')
    && (admin || hasPermission(session, 'documents.view'));
  if (canSearchDocuments) allowedTypes.push('documents');

  const workOrderHasBroadView = admin
    || hasPermission(session, 'work_orders.view')
    || hasPermission(session, 'work_orders.view_all');
  const workOrderOwnOnly = canSearchWorkOrders
    && (!workOrderHasBroadView || (!admin && session.roles.includes('maintenance_technician')));

  const requestHasBroadView = admin
    || hasPermission(session, 'maintenance_requests.view')
    || hasPermission(session, 'maintenance_requests.view_all');

  let maintenanceRequestMode: MaintenanceRequestSearchMode = 'all';
  let supervisedDepartmentIds: string[] = [];

  if (canSearchRequests) {
    if (!requestHasBroadView) {
      maintenanceRequestMode = 'own';
    } else if (!admin && session.roles.includes('maintenance_supervisor')) {
      maintenanceRequestMode = 'supervisor';
      supervisedDepartmentIds = (await db.department.findMany({
        where: { supervisorId: session.userId },
        select: { id: true },
      })).map((department) => department.id);
    } else if (!admin && session.roles.includes('maintenance_technician')) {
      maintenanceRequestMode = 'technician';
    }
  }

  const plantIds = plantScope.isSystemWide
    ? undefined
    : plantScope.isScoped && plantScope.plantId
      ? [plantScope.plantId]
      : plantScope.accessiblePlantIds;

  return {
    denyAccess: false,
    allowedTypes,
    plantIds,
    userId: session.userId,
    workOrderOwnOnly,
    maintenanceRequestMode,
    supervisedDepartmentIds,
  };
}
