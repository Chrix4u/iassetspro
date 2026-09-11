import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';

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
    if (plantScope.denyAccess || !canAccessPlant(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
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
    const isExecutionManager = isAdminAccount || isMaintenanceManager;

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
    const hasHoldControlAuthority = isSupervisor || isExecutionManager;
    const hasPlannerControlAuthority = isPlanner || isExecutionManager;
    const hasMultipleTeamMembers = (wo.teamMembers?.length ?? 0) > 1;

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
    const canHold = hasHoldControlAuthority && wo.status === 'in_progress';
    const canResume = (
      wo.status === 'on_hold'
        ? hasHoldControlAuthority
        : technicianWaitingStatuses.includes(wo.status) && (
            isAssignedExecutionActor || hasPlannerControlAuthority
          )
    );
    const resumeOpensExecutionSession = canResume &&
      technicianWaitingStatuses.includes(wo.status) &&
      isAssignedExecutionActor;

    const capabilities = {
      // Starting creates a labor timer, therefore only the assigned technician
      // or team leader receives this capability. Admin/manager control authority
      // cannot silently turn into labor attribution.
      canAcceptAssignment: isAccountableAssignmentResponder && assignmentPending,
      canDeclineAssignment: isAccountableAssignmentResponder && assignmentPending,
      assignmentResponseStatus: wo.assignmentResponseStatus,
      assignmentRespondedAt: wo.assignmentRespondedAt,
      assignmentResponseReason: wo.assignmentResponseReason,
      canStart: isAssignedExecutionActor && (
        (preExecutionStatuses.includes(wo.status) && assignmentAccepted) ||
        (wo.status === 'in_progress' && !hasOwnLiveSession)
      ),
      // `canPause` is retained for existing clients; `canHold` is the explicit
      // enterprise lifecycle name. Holding is a WO-wide supervisor control
      // action and must not depend on the supervisor owning a labor timer.
      canPause: canHold,
      canHold,
      canResume,
      resumeOpensExecutionSession,
      canLogOwnTime: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),
      canLogTeamTime: isTeamLeader && hasMultipleTeamMembers && activeExecutionStatuses.includes(wo.status),
      canRequestTools: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),
      canRequestMaterials: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),
      canRequestAssistance: (isAssignee || isTeamMember || isTeamLeader) && (
        activeExecutionStatuses.includes(wo.status) ||
        (wo.status === 'assigned' && assignmentAccepted)
      ),
      canHandover: (isAssignee || isTeamLeader) && wo.status === 'in_progress' && hasOwnLiveSession,
      canSubmitCompletion: hasMultipleTeamMembers
        ? (isTeamLeader && wo.status === 'in_progress' && !hasOwnLiveSession)
        : (isAssignee && wo.status === 'in_progress' && !hasOwnLiveSession),
      canVerify: (isSupervisor || isAdminUser) && wo.status === 'completed',
      canClose: (isPlanner || isAdminUser) && wo.status === 'verified',
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
