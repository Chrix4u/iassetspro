import { hasRole, isAdmin, type SessionData } from '@/lib/auth';

export const RESOURCE_STORE_ROLE_SLUGS = [
  'store_keeper',
  'inventory_manager',
  'tools_shop_attendant',
] as const;

/**
 * Supervisor-stage approval belongs to the supervisor explicitly accountable
 * for the work order. Maintenance/plant management and admins may override for
 * escalation/continuity, but an unrelated maintenance supervisor may not act.
 */
export function canReviewResourceRequestAsSupervisor(
  session: SessionData,
  assignedSupervisorId: string | null | undefined,
): boolean {
  if (
    isAdmin(session) ||
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

export function isResourceStoreActor(session: SessionData): boolean {
  return (
    isAdmin(session) ||
    RESOURCE_STORE_ROLE_SLUGS.some((role) => hasRole(session, role))
  );
}
