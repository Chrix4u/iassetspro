import type { Prisma } from '@prisma/client';
import { nextInspectionDate } from '@/lib/pm-inspection';
import { buildAuditData, type AuditContext } from '@/lib/audit-helpers';

type InspectionCloseTx = Pick<Prisma.TransactionClient,
  'componentInspectionRecord' | 'componentInspectionPoint' | 'auditLog'>;

export interface AdvanceClosedInspectionInput {
  tx: InspectionCloseTx;
  workOrderId: string;
  woNumber: string;
  woActualEnd: Date | null;
  closedAt: Date;
  actorId: string;
  auditCtx?: AuditContext;
}

/**
 * A failed inspection stays due while its corrective WO is open.
 * Only the verified, irreversible planner closeout advances its next inspection.
 * This is independent of PM assignment recurrence, which is handled separately.
 */
export async function advanceClosedInspectionPoint(input: AdvanceClosedInspectionInput) {
  const linked = await input.tx.componentInspectionRecord.findFirst({
    where: { workOrderId: input.workOrderId },
    select: { id: true, inspectionPointId: true, inspectedAt: true },
  });
  if (!linked) return { advanced: false, inspectionPointId: null, nextInspection: null };
  const point = await input.tx.componentInspectionPoint.findUnique({
    where: { id: linked.inspectionPointId },
    select: { id: true, isActive: true, frequency: true, nextInspection: true },
  });
  if (!point?.isActive) return { advanced: false, inspectionPointId: linked.inspectionPointId, nextInspection: null };
  const completedAt = input.woActualEnd && input.woActualEnd.getTime() >= linked.inspectedAt.getTime()
    ? input.woActualEnd
    : input.closedAt;
  const nextInspection = nextInspectionDate(completedAt, point.frequency);
  if (!nextInspection) throw new Error(`Cannot advance inspection point ${point.id}: unsupported interval ${point.frequency}`);
  await input.tx.componentInspectionPoint.update({
    where: { id: point.id },
    data: { nextInspection },
  });
  await input.tx.auditLog.create({
    data: buildAuditData(
      'update', 'component_inspection_point', point.id, input.actorId,
      { nextInspection: point.nextInspection?.toISOString() || null },
      {
        nextInspection: nextInspection.toISOString(),
        inspectionRecordId: linked.id,
        workOrderId: input.workOrderId,
        woNumber: input.woNumber,
        reason: 'Technician-completed and verified corrective WO closed by planner',
      }, input.auditCtx,
    ),
  });
  return { advanced: true, inspectionPointId: point.id, nextInspection };
}
