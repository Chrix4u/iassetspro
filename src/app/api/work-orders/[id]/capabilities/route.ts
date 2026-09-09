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
    const isAdminUser = isAdmin(session) || session.roles.some(r =>
      ['maintenance_manager', 'plant_manager'].includes(r),
    );

    const isTeamLeader = isTeamLeaderFromField || isTeamLeaderFromMembers;
    const hasExecutionAuthority = isAssignee || isTeamLeader || isAdminUser;
    const hasMultipleTeamMembers = (wo.teamMembers?.length ?? 0) > 1;

    const preExecutionStatuses = ['assigned', 'planned'];
    const waitingStatuses = ['on_hold', 'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit'];
    const activeExecutionStatuses = ['in_progress', ...waitingStatuses, 'pending_handover'];

    // A WO can legitimately be in_progress without a live timer after a
    // supervisor requests rework. Capability derivation therefore has to use
    // the same canonical live-session definition as Start/Resume rather than
    // status alone.
    const ownLiveSession = wo.status === 'in_progress' && hasExecutionAuthority
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

    const capabilities = {
      // `canStart` also covers an explicit execution restart when the WO is
      // already in_progress but this actor has no live timer (e.g. rework).
      canStart: hasExecutionAuthority && (
        preExecutionStatuses.includes(wo.status) ||
        (wo.status === 'in_progress' && !hasOwnLiveSession)
      ),
      canPause: hasExecutionAuthority && wo.status === 'in_progress' && hasOwnLiveSession,
      canResume: hasExecutionAuthority && waitingStatuses.includes(wo.status),
      canLogOwnTime: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),
      canLogTeamTime: isTeamLeader && hasMultipleTeamMembers && activeExecutionStatuses.includes(wo.status),
      canRequestTools: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),
      canRequestMaterials: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),
      canRequestAssistance: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),
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
