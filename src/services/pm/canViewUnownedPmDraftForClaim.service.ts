import type { Prisma } from '@prisma/client';
import { hasPermission, type SessionData } from '@/lib/auth';

type PlannerMembershipTx = Pick<Prisma.TransactionClient, 'userPlant'>;

export interface ClaimablePmWorkOrder {
  pmScheduleId: string | null;
  plannerId: string | null;
  plantId: string | null;
  status: string;
  isLocked: boolean;
}

/**
 * Narrow, read-only exception for viewing a PM draft before claiming it.
 *
 * A normal planner is not already related to an unowned draft, so regular
 * relationship-based WO detail authorization denies them even though the
 * PM backlog filter can list it. This exception does NOT enable general
 * work-order browsing: it only exposes an unlocked unowned schedule-backed
 * draft to an active plant planner with current write access. The caller must
 * still enforce the normal strict work-order plant scope.
 */
export async function canViewUnownedPmDraftForClaim(
  tx: PlannerMembershipTx,
  session: SessionData,
  workOrder: ClaimablePmWorkOrder,
): Promise<boolean> {
  if (!workOrder.plantId
    || !workOrder.pmScheduleId
    || workOrder.plannerId
    || workOrder.status !== 'draft'
    || workOrder.isLocked) return false;

  const hasPlannerRole = session.roles.some((role) =>
    role === 'planner' || role === 'maintenance_planner');
  if (!hasPlannerRole
    || !hasPermission(session, 'work_orders.update')
    || (!hasPermission(session, 'work_orders.view')
      && !hasPermission(session, 'work_orders.view_all'))) return false;

  const membership = await tx.userPlant.findFirst({
    where: {
      userId: session.userId,
      plantId: workOrder.plantId,
      accessLevel: { in: ['write', 'admin'] },
      user: {
        is: {
          status: 'active',
          userRoles: {
            some: { role: { slug: { in: ['planner', 'maintenance_planner'] } } },
          },
        },
      },
    },
    select: { id: true },
  });
  return Boolean(membership);
}
