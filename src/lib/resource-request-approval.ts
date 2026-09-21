import { hasPermission, hasRole, isAdmin, type SessionData } from '@/lib/auth';

export const RESOURCE_STORE_ROLE_SLUGS = [
  'store_keeper',
  'inventory_manager',
  'tools_shop_attendant',
] as const;

export type ResourceRequestUpdatePermission =
  | 'repair_material_requests.update'
  | 'repair_tool_requests.update';

/**
 * Supervisor-stage approval belongs to the supervisor explicitly accountable
 * for the work order. Maintenance/plant management and admins may override for
 * escalation/continuity, but an unrelated maintenance supervisor may not act.
 */
export function canReviewResourceRequestAsSupervisor(
  session: SessionData,
  assignedSupervisorId: string | null | undefined,
  requiredPermission: ResourceRequestUpdatePermission,
): boolean {
  if (isAdmin(session)) return true;
  if (!hasPermission(session, requiredPermission)) return false;

  if (
    hasRole(session, 'maintenance_manager') ||
    hasRole(session, 'plant_manager')
  ) {
    return true;
  }

  return (
    hasRole(session, 'maintenance_supervisor') &&
    Boolean(assignedSupervisorId) &&
    assignedSupervisorId === session.userId
  );
}

export function isResourceStoreActor(
  session: SessionData,
  requiredPermission: ResourceRequestUpdatePermission,
): boolean {
  if (isAdmin(session)) return true;
  if (!hasPermission(session, requiredPermission)) return false;
  return RESOURCE_STORE_ROLE_SLUGS.some((role) => hasRole(session, role));
}
