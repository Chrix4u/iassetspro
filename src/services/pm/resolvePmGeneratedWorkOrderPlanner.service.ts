import type { Prisma } from '@prisma/client';
import { resolveCorrectiveInspectionPlanner } from '@/services/pm/resolveCorrectiveInspectionPlanner.service';

type PlannerTx = Pick<Prisma.TransactionClient, 'userPlant'>;

/**
 * Resolve a real accountable planner for any automatically generated PM WO.
 * 
 * Retain the schedule creator only while they are an ACTIVE planner with
 * write/admin access to this exact plant. Schedules may be created by admins,
 * technicians or people who have since changed roles; never mistake schedule
 * authorship for continuing planner authorization.
 *
 * Otherwise select a deterministic eligible plant planner, or leave ownership
 * unassigned for deliberate maintenance-management review. No permission
 * boundaries or closeout rules are bypassed.
 */
export async function resolvePmGeneratedWorkOrderPlanner(
  tx: PlannerTx,
  plantId: string | null | undefined,
  scheduleCreatorId: string,
): Promise<string | null> {
  if (!plantId) return null;

  const creatorIsPlanner = await tx.userPlant.findFirst({
    where: {
      plantId,
      userId: scheduleCreatorId,
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
    select: { userId: true },
  });
  if (creatorIsPlanner) return creatorIsPlanner.userId;

  return resolveCorrectiveInspectionPlanner(tx, plantId);
}
