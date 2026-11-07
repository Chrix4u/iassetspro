import type { Prisma } from '@prisma/client';

type PlannerOwnerTx = Pick<Prisma.TransactionClient, 'userPlant'>;

/**
 * Resolve the accountable planner for an inspection-created corrective WO.
 *
 * The inspector can be a technician, so never set plannerId to the inspector
 * merely because they submitted the defect. Restrict to an active planner
 * with write access to the asset's plant. Choose a primary plant planner
 * deterministically when more than one eligible planner exists.
 *
 * When none is available, leave the corrective WO in draft/unassigned;
 * maintenance management retains its existing audited override path.
 */
export async function resolveCorrectiveInspectionPlanner(
  tx: PlannerOwnerTx,
  plantId: string,
): Promise<string | null> {
  const assignment = await tx.userPlant.findFirst({
    where: {
      plantId,
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
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { userId: 'asc' }],
  });
  return assignment?.userId || null;
}
