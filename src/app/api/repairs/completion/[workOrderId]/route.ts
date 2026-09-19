import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasRole } from '@/lib/auth';
import { canReviewResourceRequestAsSupervisor } from '@/lib/resource-request-approval';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { notifyUser } from '@/lib/notifications';
import { createAuditLog } from '@/lib/audit';
import { executeTransition } from '@/lib/state-machine';
import { checkReadiness } from '@/services/workOrderReadiness.service';

// GET /api/repairs/completion/[workOrderId]
export async function GET(request: NextRequest, { params }: { params: Promise<{ workOrderId: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { workOrderId } = await params;

    // Plant authorization
    const plantAuth = await authorizeWorkOrderPlant(request, session, workOrderId);
    if (!plantAuth.ok) return plantAuth.response;

    const completion = await db.repairCompletion.findUnique({
      where: { workOrderId },
      include: {
        supervisorApprovedBy: { select: { id: true, fullName: true } },
        plannerClosedBy: { select: { id: true, fullName: true } },
        workOrder: {
          select: {
            id: true,
            woNumber: true,
            title: true,
            status: true,
            isLocked: true,
            lockReason: true,
            locker: { select: { id: true, fullName: true } },
            assignedSupervisorId: true,
            plannerId: true,
            assignedTo: true,
            teamLeaderId: true,
            assignedSupervisor: { select: { id: true, fullName: true } },
            planner: { select: { id: true, fullName: true } },
            assignee: { select: { id: true, fullName: true, avatar: true } },
            teamMembers: { select: { userId: true, role: true } },
          },
        },
      },
    });

    if (!completion) return NextResponse.json({ success: false, error: 'Completion record not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: completion });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load completion record';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/completion/[workOrderId] — create/update or workflow action
export async function POST(request: NextRequest, { params }: { params: Promise<{ workOrderId: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { workOrderId } = await params;
    const body = await request.json();
    const { action, completionNotes, findings, rootCause, correctiveAction, materialsUsedSummary, toolsUsedSummary, totalLaborHours, totalMaterialCost, totalToolCost, totalDowntimeMinutes, supervisorReviewNotes, reworkReason, closureNotes } = body;

    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
      include: { assignedSupervisor: { select: { id: true, fullName: true } }, planner: { select: { id: true, fullName: true } }, assignee: { select: { id: true, fullName: true } }, teamMembers: { select: { userId: true, role: true } } },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });

    if (action === 'supervisor_approve' || action === 'supervisor_request_rework') {
      if (!canReviewResourceRequestAsSupervisor(session, wo.assignedSupervisorId)) {
        return NextResponse.json({
          success: false,
          error: 'Only the assigned maintenance supervisor may review completion. Maintenance manager, plant manager, or admin may override for escalation.',
        }, { status: 403 });
      }
    }

    if (action === 'planner_close') {
      const canClose =
        isAdmin(session) ||
        hasRole(session, 'maintenance_manager') ||
        (hasRole(session, 'maintenance_planner') && Boolean(wo.plannerId) && wo.plannerId === session.userId);
      if (!canClose) {
        return NextResponse.json({
          success: false,
          error: 'Only the assigned maintenance planner may close this work order. Maintenance manager or admin may override.',
        }, { status: 403 });
      }
    }

    // ── IMMUTABILITY CHECK ──
    // After planner_close, the WO is permanently locked. No mutations allowed.
    // This is non-negotiable — even admin cannot override a planner-closed work order.
    if (wo.isLocked) {
      return NextResponse.json({
        success: false,
        error: `Work order is permanently locked${wo.lockReason ? ` (${wo.lockReason})` : ''}. No modifications are allowed by anyone, including administrators. The work order has been completed and archived by the planner.`,
        isLocked: true,
      }, { status: 403 });
    }

    const now = new Date();

    // Submit completion (technician)
    if (action === 'submit' || action === undefined) {
      // ── P2L: Readiness check before completion ──
      const readiness = await checkReadiness(workOrderId, 'complete');
      if (!readiness.ready) {
        return NextResponse.json({
          success: false,
          error: 'Work order is not ready for completion',
          blockers: readiness.blockers,
        }, { status: 422 });
      }

      // ── Team Execution Governance: completion authority ──
      // Count team members excluding the assignedTo user if they're also a member
      const teamMemberIds = (wo.teamMembers || [])
        .map((m) => m.userId)
        .filter((uid) => uid !== wo.assignedTo);
      const distinctTeamCount = new Set(teamMemberIds).size;
      const isMultiTech = distinctTeamCount >= 2;

      const isAssignee = wo.assignedTo === session.userId;
      const isTeamLeaderByMember = wo.teamMembers?.some((m) => m.userId === session.userId && m.role === 'team_leader') || false;
      const isTeamLeader = wo.teamLeaderId === session.userId || isTeamLeaderByMember;
      const isManagerOverride = isAdmin(session) || hasRole(session, 'maintenance_manager');

      if (isMultiTech) {
        // Multi-tech WO: only team leader or admin/manager can submit
        if (!isTeamLeader && !isManagerOverride) {
          return NextResponse.json({ success: false, error: 'For multi-technician work orders, only the team leader can submit completion' }, { status: 403 });
        }
      } else {
        // Single-tech WO: only the assigned technician or admin/manager can submit
        if (!isAssignee && !isManagerOverride) {
          return NextResponse.json({ success: false, error: 'Only the assigned technician can submit completion for this work order' }, { status: 403 });
        }
      }

      const isAdminOverride = isManagerOverride && !isAssignee && !(isMultiTech && isTeamLeader);

      // Calculate totals from time logs
      const timeLogs = await db.workOrderTimeLog.findMany({ where: { workOrderId } });
      let calculatedLaborHours = 0;
      for (const tl of timeLogs) {
        if (tl.action === 'start' || tl.action === 'resume' || tl.action === 'complete') {
          calculatedLaborHours += (tl.duration || 0);
        }
      }

      // Check if technician has logged time (warning only, allow submission)
      const hasTimeLogs = timeLogs.length > 0;
      const hasDuration = timeLogs.some((tl) => tl.duration && tl.duration > 0);

      // Calculate downtime
      const downtimes = await db.workOrderDowntime.findMany({ where: { workOrderId } });
      const calculatedDowntime = downtimes.reduce((sum, d) => sum + (d.durationMinutes || 0), 0);

      // Wrap completion upsert + WO status transition in a single transaction
      const completion = await db.$transaction(async (tx) => {
        const upserted = await tx.repairCompletion.upsert({
          where: { workOrderId },
          create: {
            workOrderId,
            completionNotes: completionNotes || null,
            findings: findings || null,
            rootCause: rootCause || null,
            correctiveAction: correctiveAction || null,
            materialsUsedSummary: materialsUsedSummary || '[]',
            toolsUsedSummary: toolsUsedSummary || '[]',
            totalLaborHours: totalLaborHours || calculatedLaborHours,
            totalMaterialCost: totalMaterialCost || 0,
            totalToolCost: totalToolCost || 0,
            totalDowntimeMinutes: totalDowntimeMinutes || calculatedDowntime,
            supervisorStatus: 'pending_review',
            plannerStatus: 'pending_closure',
          },
          update: {
            completionNotes: completionNotes || undefined,
            findings: findings || undefined,
            rootCause: rootCause || undefined,
            correctiveAction: correctiveAction || undefined,
            materialsUsedSummary: materialsUsedSummary || undefined,
            toolsUsedSummary: toolsUsedSummary || undefined,
            totalLaborHours: totalLaborHours || calculatedLaborHours,
            totalMaterialCost: totalMaterialCost || undefined,
            totalToolCost: totalToolCost || undefined,
            totalDowntimeMinutes: totalDowntimeMinutes || calculatedDowntime,
            ...(reworkReason ? { reworkReason, reworkCount: { increment: 1 } } : {}),
            supervisorStatus: 'pending_review',
          },
          include: {
            supervisorApprovedBy: { select: { id: true, fullName: true } },
            workOrder: { select: { id: true, woNumber: true } },
          },
        });

        // Delegate WO status change to state machine (in_progress → completed)
        const transitionResult = await executeTransition('work_order', workOrderId, 'completed', session, {
          tx,
          extraData: { actualEnd: now, actualHours: upserted.totalLaborHours },
        });
        if (!transitionResult.success) {
          throw new Error(transitionResult.error);
        }

        return upserted;
      });

      // Notify supervisor (force SMS for critical workflow step)
      if (wo.assignedSupervisorId) {
        await notifyUser(wo.assignedSupervisorId, 'wo_completed', `WO Completed: ${wo.woNumber}`, `${session.fullName} completed work order "${wo.title}". Your review is required.`, 'work_order', workOrderId, 'maintenance-work-orders', { forceSms: true });
      }

      await createAuditLog(session.userId, 'RepairCompletion', 'submit_completion', completion.id, {
        newValues: { workOrderId, status: 'completed', ...(isAdminOverride ? { adminOverride: true } : {}) },
      });

      return NextResponse.json({
        success: true,
        data: completion,
        warnings: !hasTimeLogs || !hasDuration
          ? ['No time has been logged for this work order. Consider logging time for accurate records.']
          : undefined,
      });
    }

    // Supervisor approval
    if (action === 'supervisor_approve') {
      let completion = await db.repairCompletion.findUnique({ where: { workOrderId } });
      if (!completion) return NextResponse.json({ success: false, error: 'Completion record not found. Submit completion first.' }, { status: 400 });
      if (completion.supervisorStatus !== 'pending_review') return NextResponse.json({ success: false, error: `Cannot approve: supervisor status is ${completion.supervisorStatus}` }, { status: 400 });

      // Wrap completion update + WO status transition in a single transaction
      completion = await db.$transaction(async (tx) => {
        const updated = await tx.repairCompletion.update({
          where: { workOrderId },
          data: { supervisorStatus: 'approved', supervisorApprovedById: session.userId, supervisorApprovedAt: now, supervisorReviewNotes: supervisorReviewNotes || null },
        });

        // Delegate WO status change to state machine (completed → verified)
        const transitionResult = await executeTransition('work_order', workOrderId, 'verified', session, { tx });
        if (!transitionResult.success) {
          throw new Error(transitionResult.error);
        }

        return updated;
      });

      // Notify planner (force SMS for critical workflow step)
      if (wo.plannerId) {
        await notifyUser(wo.plannerId, 'wo_completed', `WO Ready for Closure: ${wo.woNumber}`, `${session.fullName} approved completion of "${wo.title}". Ready for your final review and closure.`, 'work_order', workOrderId, 'maintenance-work-orders', { forceSms: true });
      }

      await createAuditLog(session.userId, 'RepairCompletion', 'supervisor_approve_completion', completion.id, {
        newValues: { supervisorStatus: 'approved' },
      });

      return NextResponse.json({ success: true, data: completion });
    }

    // Supervisor requests rework
    if (action === 'supervisor_request_rework') {
      if (!reworkReason) return NextResponse.json({ success: false, error: 'reworkReason is required for rework request' }, { status: 400 });

      let completion = await db.repairCompletion.findUnique({ where: { workOrderId } });
      if (!completion) return NextResponse.json({ success: false, error: 'Completion record not found' }, { status: 400 });
      if (completion.supervisorStatus !== 'pending_review') return NextResponse.json({ success: false, error: `Cannot request rework: status is ${completion.supervisorStatus}` }, { status: 400 });

      // Wrap completion update + WO status transition in a single transaction
      completion = await db.$transaction(async (tx) => {
        const updated = await tx.repairCompletion.update({
          where: { workOrderId },
          data: { supervisorStatus: 'rework_requested', reworkReason, supervisorReviewNotes, reworkCount: { increment: 1 } },
        });

        // Delegate WO status change to state machine (completed → in_progress, requires reason)
        const transitionResult = await executeTransition('work_order', workOrderId, 'in_progress', session, {
          tx,
          reason: reworkReason,
        });
        if (!transitionResult.success) {
          throw new Error(transitionResult.error);
        }

        return updated;
      });

      // Notify technician (force SMS for critical workflow step)
      if (wo.assignedTo) {
        await notifyUser(wo.assignedTo, 'wo_rework', `Rework Required: ${wo.woNumber}`, `${session.fullName} requested rework on "${wo.title}". Reason: ${reworkReason}`, 'work_order', workOrderId, 'maintenance-work-orders', { forceSms: true });
      }

      await createAuditLog(session.userId, 'RepairCompletion', 'supervisor_request_rework', completion.id, {
        newValues: { supervisorStatus: 'rework_requested', reworkReason },
      });

      return NextResponse.json({ success: true, data: completion });
    }

    // Planner closure
    if (action === 'planner_close') {
      let completion = await db.repairCompletion.findUnique({ where: { workOrderId } });
      if (!completion) return NextResponse.json({ success: false, error: 'Completion record not found' }, { status: 400 });
      if (completion.supervisorStatus !== 'approved') return NextResponse.json({ success: false, error: 'Cannot close: supervisor has not approved yet' }, { status: 400 });

      // Perform planner_close with WO immutability (lock)
      // Wrap completion update + state machine transition in a single transaction
      const laborCost = completion.totalLaborHours * (Number(process.env.DEFAULT_LABOR_RATE_HOURS) || 50);
      const updatedCompletion = await db.$transaction(async (tx) => {
        const updated = await tx.repairCompletion.update({
          where: { workOrderId },
          data: { plannerStatus: 'closed', plannerClosedById: session.userId, plannerClosedAt: now, closureNotes: closureNotes || null },
        });

        // Delegate WO status change to state machine (verified → closed) with lock + cost data
        const transitionResult = await executeTransition('work_order', workOrderId, 'closed', session, {
          tx,
          extraData: {
            isLocked: true,
            lockedBy: session.userId,
            lockedAt: now,
            lockReason: 'Closed by planner — work order is now immutable',
            laborCost,
            partsCost: completion.totalMaterialCost,
          },
        });
        if (!transitionResult.success) {
          throw new Error(transitionResult.error);
        }

        return updated;
      });

      // Notify all parties (force SMS for critical workflow step)
      const notifyUsers = [wo.assignedTo, wo.assignedSupervisorId].filter(Boolean) as string[];
      for (const uid of notifyUsers) {
        await notifyUser(uid, 'wo_closed', `WO Closed: ${wo.woNumber}`, `${session.fullName} closed "${wo.title}". This work order is now locked.`, 'work_order', workOrderId, 'maintenance-work-orders', { forceSms: true });
      }

      await createAuditLog(session.userId, 'RepairCompletion', 'planner_close_completion', updatedCompletion.id, {
        newValues: { plannerStatus: 'closed', isLocked: true, lockReason: 'Closed by planner' },
      });

      return NextResponse.json({ success: true, data: updatedCompletion });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process completion action';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
