import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { canManageWorkOrder, canPerformWorkOrderTransition, canViewWorkOrder } from '@/services/workOrderAccess.service';
import { checkReadiness } from '@/services/workOrderReadiness.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        plantId: true,
        isLocked: true,
        assignmentResponseStatus: true,
        assignmentRespondedAt: true,
        assignmentResponseReason: true,
        maintenanceRequest: {
          select: { requestedBy: true },
        },
        teamMembers: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const userId = session.userId;
    const isAssignee = wo.assignedTo === userId;
    const isTeamLeaderFromField = wo.teamLeaderId === userId;
    const isTeamLeaderFromMembers = wo.teamMembers?.some(m => m.userId === userId && m.role === 'team_leader') ?? false;
    const isTeamMember = wo.teamMembers?.some(m => m.userId === userId) ?? false;
    const isSupervisor = wo.assignedSupervisorId === userId;
    const isPlanner = wo.plannerId === userId;

    // Review/close authority intentionally includes plant management. Execution
    // hold/waiting control follows the canonical WO transitions and stays with
    // admin/maintenance-management plus the specifically accountable actor.
    const isAdminAccount = isAdmin(session);
    const isMaintenanceManager = session.roles.includes('maintenance_manager');
    const isPlantManager = session.roles.includes('plant_manager');
    const isAdminUser = isAdminAccount || isMaintenanceManager || isPlantManager;
    const isTeamLeader = isTeamLeaderFromField || isTeamLeaderFromMembers;
    const isAssignedExecutionActor = isAssignee || isTeamLeader;
    const assignmentActorIds = new Set<string>();
    if (wo.assignedTo) assignmentActorIds.add(wo.assignedTo);
    for (const member of wo.teamMembers ?? []) assignmentActorIds.add(member.userId);
    const isAccountableAssignmentResponder = assignmentActorIds.size > 1
      ? isTeamLeader
      : isAssignedExecutionActor;
    const assignmentPending = wo.status === 'assigned' && wo.assignmentResponseStatus === 'pending';
    const assignmentAccepted = wo.assignmentResponseStatus === 'accepted';
    const hasMultipleTeamMembers = (wo.teamMembers?.length ?? 0) > 1;
    const canCreateToolRequest = isAdminAccount || hasPermission(session, 'repair_tool_requests.create');
    const canCreateMaterialRequest = isAdminAccount || hasPermission(session, 'repair_material_requests.create');
    const canCreateAssistanceRequest = isAdminAccount || hasPermission(session, 'assistance_requests.create');
    const canCreateTimeLog = isAdminAccount
      || hasPermission(session, 'work_orders.update')
      || hasPermission(session, 'time_logs.create');
    const canManageDowntime = (
      isAdminAccount || hasPermission(session, 'work_orders.update')
    ) && canManageWorkOrder(session, wo);

    // Canonical first execution begins only after assignment. A planned WO must
    // be assigned before it can transition to in_progress.
    const preExecutionStatuses = ['assigned'];
    const waitingStatuses = ['on_hold', 'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit'];
    const technicianWaitingStatuses = ['waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit'];
    const activeExecutionStatuses = ['in_progress', ...waitingStatuses, 'pending_handover'];

    // A live execution timer belongs only to an assigned execution actor. A WO
    // can legitimately be in_progress without one after supervisor/planner
    // control release or supervisor-requested rework.
    const ownLiveSession = wo.status === 'in_progress' && isAssignedExecutionActor
      ? await db.workOrderTimeLog.findFirst({
          where: {
            workOrderId: id,
            userId,
            action: { in: ['start', 'resume'] },
            endTime: null,
            workOrder: { status: 'in_progress' },
          },
          select: { id: true },
        })
      : null;

    const hasOwnLiveSession = Boolean(ownLiveSession);
    const canHold = wo.status === 'in_progress'
      && canPerformWorkOrderTransition(session, wo, 'on_hold');
    const canResume = (
      wo.status === 'on_hold' || technicianWaitingStatuses.includes(wo.status)
    ) && canPerformWorkOrderTransition(session, wo, 'in_progress');
    const resumeOpensExecutionSession = canResume &&
      technicianWaitingStatuses.includes(wo.status) &&
      isAssignedExecutionActor;

    // Keep Start visible only when both lifecycle state and actor/endpoint
    // authority match the same central transition contract used by the API.
    const canAttemptStart = canPerformWorkOrderTransition(session, wo, 'in_progress') && (
      (preExecutionStatuses.includes(wo.status) && assignmentAccepted) ||
      (wo.status === 'in_progress' && !hasOwnLiveSession)
    );
    const startReadiness = canAttemptStart
      ? await checkReadiness(id, 'start')
      : null;

    const canAttemptCompletion = wo.status === 'in_progress'
      && !hasOwnLiveSession
      && canPerformWorkOrderTransition(session, wo, 'completed');
    const completionReadiness = canAttemptCompletion
      ? await checkReadiness(id, 'complete')
      : null;

    const capabilities = {
      // Starting creates a labor timer, therefore only the assigned technician
      // or team leader receives this capability. Admin/manager control authority
      // cannot silently turn into labor attribution.
      canAcceptAssignment: isAccountableAssignmentResponder && assignmentPending,
      canDeclineAssignment: isAccountableAssignmentResponder && assignmentPending,
      assignmentResponseStatus: wo.assignmentResponseStatus,
      assignmentRespondedAt: wo.assignmentRespondedAt,
      assignmentResponseReason: wo.assignmentResponseReason,
      canStart: canAttemptStart,
      startReadiness,
      // `canPause` is retained for existing clients; `canHold` is the explicit
      // enterprise lifecycle name. Holding is a WO-wide supervisor control
      // action and must not depend on the supervisor owning a labor timer.
      canPause: canHold,
      canHold,
      canResume,
      resumeOpensExecutionSession,
      canLogOwnTime: canCreateTimeLog
        && (isAssignee || isTeamMember || isTeamLeader)
        && activeExecutionStatuses.includes(wo.status),
      canLogTeamTime: canCreateTimeLog
        && isTeamLeader
        && hasMultipleTeamMembers
        && activeExecutionStatuses.includes(wo.status),
      canRequestTools: canCreateToolRequest
        && (isAssignee || isTeamMember || isTeamLeader)
        && activeExecutionStatuses.includes(wo.status),
      canRequestMaterials: canCreateMaterialRequest
        && (isAssignee || isTeamMember || isTeamLeader)
        && activeExecutionStatuses.includes(wo.status),
      canLogDowntime: activeExecutionStatuses.includes(wo.status) && (
        isAssignee || isTeamMember || isTeamLeader || canManageDowntime
      ),
      canRequestAssistance: canCreateAssistanceRequest
        && (isAssignee || isTeamMember || isTeamLeader)
        && (
          activeExecutionStatuses.includes(wo.status) ||
          (wo.status === 'assigned' && assignmentAccepted)
        ),
      canHandover: wo.status === 'in_progress'
        && canPerformWorkOrderTransition(session, wo, 'pending_handover'),
      canSubmitCompletion: canAttemptCompletion,
      completionReadiness,
      canVerify: wo.status === 'completed'
        && canPerformWorkOrderTransition(session, wo, 'verified'),
      canClose: wo.status === 'verified'
        && canPerformWorkOrderTransition(session, wo, 'closed'),
      hasActiveExecutionSession: hasOwnLiveSession,
      isTeamLeader,
      isTeamMember,
      isSupervisor,
      isPlanner,
      isAdmin: isAdminUser,
    };

    return NextResponse.json({ success: true, data: capabilities });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch capabilities';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
