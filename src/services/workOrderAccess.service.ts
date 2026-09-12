import { hasPermission, isAdmin, type SessionData } from '@/lib/auth';

export interface WorkOrderAccessSnapshot {
  assignedTo?: string | null;
  teamLeaderId?: string | null;
  assignedSupervisorId?: string | null;
  plannerId?: string | null;
  teamMembers?: Array<{ userId: string }> | null;
  maintenanceRequest?: {
    requestedBy?: string | null;
    requester?: { id: string } | null;
  } | null;
}

const MANAGEMENT_OVERRIDE_ROLES = new Set([
  'maintenance_manager',
  'plant_manager',
]);

/**
 * System/maintenance management may inspect WOs inside the plant boundary.
 * `work_orders.view` is deliberately NOT a global-view grant: it is the basic
 * permission used by normal workflow actors. Only the explicit view-all grant,
 * admin, or accountable management roles may bypass relationship scoping.
 */
export function hasWorkOrderViewOverride(session: SessionData): boolean {
  return isAdmin(session)
    || hasPermission(session, 'work_orders.view_all')
    || session.roles.some((role) => MANAGEMENT_OVERRIDE_ROLES.has(role));
}

/**
 * Relationship-scoped read/capability access after plant authorization.
 */
export function canViewWorkOrder(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  if (hasWorkOrderViewOverride(session)) return true;

  const userId = session.userId;
  if (workOrder.assignedTo === userId) return true;
  if (workOrder.teamLeaderId === userId) return true;
  if (workOrder.assignedSupervisorId === userId) return true;
  if (workOrder.plannerId === userId) return true;
  if (workOrder.teamMembers?.some((member) => member.userId === userId)) return true;

  const requesterId = workOrder.maintenanceRequest?.requestedBy
    ?? workOrder.maintenanceRequest?.requester?.id
    ?? null;
  return requesterId === userId;
}

/**
 * Generic WO edits are management/planning controls, not technician execution
 * writes. Execution actors use dedicated task/execution/time/resource endpoints.
 */
export function canManageWorkOrder(
  session: SessionData,
  workOrder: Pick<WorkOrderAccessSnapshot, 'assignedSupervisorId' | 'plannerId'>,
): boolean {
  if (isAdmin(session)) return true;
  if (session.roles.some((role) => MANAGEMENT_OVERRIDE_ROLES.has(role))) return true;
  return workOrder.assignedSupervisorId === session.userId
    || workOrder.plannerId === session.userId;
}
