import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import type { SessionContext, TransitionResult } from '@/services/workExecution.service';
import type { Prisma } from '@prisma/client';

export interface ResumeConfirmedHandoverOptions {
  reason?: string;
}

/**
 * Resume a WO after a confirmed shift handover.
 *
 * Normal path: only the designated receivedById may resume and open a live
 * execution timer in their own name.
 *
 * Supervisor/manager override is a control release only. It may reassign the
 * WO to the designated receiver and move the WO back to in_progress, but it
 * must never create technician labor time in the overriding actor's name. The
 * receiving technician must explicitly start execution afterwards.
 */
export async function resumeConfirmedHandover(
  workOrderId: string,
  session: SessionContext,
  options: ResumeConfirmedHandoverOptions = {},
): Promise<TransitionResult> {
  const wo = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, status: true, assignedTo: true, plantId: true },
  });

  if (!wo) return { success: false, error: 'Work order not found' };
  if (wo.status !== 'pending_handover') {
    return { success: false, error: `Cannot resume after handover: work order status is '${wo.status}'` };
  }
  if (!wo.plantId) {
    return { success: false, error: 'Operational work order must have a plant before handover resume' };
  }

  const now = new Date();
  let handoverId = '';
  let receiverId = '';
  let executionSessionOpened = false;

  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const handover = await tx.shiftHandover.findFirst({
        where: { workOrderId, status: 'confirmed' },
        orderBy: { updatedAt: 'desc' },
      });

      if (!handover || !handover.receivedById) {
        throw new Error('Cannot resume work: no confirmed handover with a designated receiver exists');
      }

      handoverId = handover.id;
      receiverId = handover.receivedById;

      const receiver = await tx.user.findUnique({
        where: { id: receiverId },
        select: { id: true, status: true },
      });
      if (!receiver || receiver.status !== 'active') {
        throw new Error('Cannot resume work: designated handover receiver is not an active user');
      }

      const receiverPlant = await tx.userPlant.findFirst({
        where: { userId: receiverId, plantId: wo.plantId! },
        select: { id: true },
      });
      if (!receiverPlant) {
        throw new Error('Cannot resume work: designated handover receiver no longer has access to this plant');
      }

      const isOverride = session.userId !== receiverId;
      const canOverride = session.roles.some((role) =>
        ['admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager'].includes(role),
      );

      if (isOverride && !canOverride) {
        throw new Error('Cannot resume work: only the designated handover receiver can resume work');
      }
      if (isOverride && !options.reason?.trim()) {
        throw new Error('Supervisor/manager override requires a reason');
      }

      executionSessionOpened = !isOverride;

      // Only the actual receiving technician opens labor time. Control-only
      // releases deliberately skip technician-session conflict checks because
      // they are not creating a live execution session.
      if (executionSessionOpened) {
        const existingLiveSession = await tx.workOrderTimeLog.findFirst({
          where: {
            userId: receiverId,
            action: { in: ['start', 'resume'] },
            endTime: null,
            workOrder: { status: 'in_progress' },
          },
          select: {
            workOrderId: true,
            workOrder: { select: { woNumber: true } },
            startTime: true,
            timestamp: true,
          },
        });
        if (existingLiveSession) {
          const activeWo = existingLiveSession.workOrder?.woNumber || 'unknown';
          throw new Error(
            existingLiveSession.workOrderId === workOrderId
              ? 'Cannot resume work: an active execution session already exists on this work order'
              : `Cannot resume work: you already have an active work session on WO #${activeWo}. Stop or hand over that session first.`,
          );
        }
      }

      const transition = await executeTransition('work_order', workOrderId, 'in_progress', session, { tx });
      if (!transition.success) throw new Error(transition.error || 'Failed to resume work order');

      const existingMember = await tx.workOrderTeamMember.findFirst({
        where: { workOrderId, userId: receiverId },
        select: { id: true },
      });
      if (!existingMember) {
        await tx.workOrderTeamMember.create({
          data: {
            workOrderId,
            userId: receiverId,
            role: 'assistant',
            accessLevel: 'full',
            addedVia: 'shift_handover',
            assignedAt: now,
          },
        });
      }

      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { assignedTo: receiverId },
      });

      if (executionSessionOpened) {
        await tx.workOrderTimeLog.create({
          data: {
            workOrderId,
            userId: receiverId,
            action: 'resume',
            notes: 'Resumed after confirmed shift handover',
            timestamp: now,
            startTime: now,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: isOverride ? 'release_after_handover_override' : 'resume_after_handover',
          entityType: 'work_order',
          entityId: workOrderId,
          oldValues: JSON.stringify({ status: wo.status, assignedTo: wo.assignedTo }),
          newValues: JSON.stringify({
            status: 'in_progress',
            handoverId,
            receivedById: receiverId,
            assignedTo: receiverId,
            executionSessionOpened,
            ...(!executionSessionOpened ? { technicianExecutionStartRequired: true } : {}),
            ...(isOverride ? { overrideReason: options.reason?.trim() } : {}),
          }),
        },
      });
    });
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to resume after handover' };
  }

  return {
    success: true,
    data: {
      status: 'in_progress',
      handoverId,
      assignedTo: receiverId,
      executionSessionOpened,
      ...(!executionSessionOpened ? { technicianExecutionStartRequired: true } : {}),
    },
  };
}
