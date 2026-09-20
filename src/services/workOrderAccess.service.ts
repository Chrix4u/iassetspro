import { hasPermission, isAdmin, type SessionData } from '@/lib/auth';

export interface WorkOrderAccessSnapshot {
  status?: string | null;
  assignedTo?: string | null;
  teamLeaderId?: string | null;
  assignedSupervisorId?: string | null;
  plannerId?: string | null;
  assignedBy?: string | null;
  handoverReceiverId?: string | null;
  teamMembers?: Array<{ userId: string; role?: string | null }> | null;
  maintenanceRequest?: {
    requestedBy?: string | null;
    requester?: { id: string } | null;
  } | null;
}

const MANAGEMENT_OVERRIDE_ROLES = new Set([
  'maintenance_manager',
  'plant_manager',
]);

/**
 * System/maintenance management may inspect WOs inside the plant boundary.
 * `work_orders.view` is deliberately NOT a global-view grant: it is the basic
 * permission used by normal workflow actors. Only the explicit view-all grant,
 * admin, or accountable management roles may bypass relationship scoping.
 */
export function hasWorkOrderViewOverride(session: SessionData): boolean {
  return isAdmin(session)
    || hasPermission(session, 'work_orders.view_all')
    || session.roles.some((role) => MANAGEMENT_OVERRIDE_ROLES.has(role));
}

/**
 * Relationship-scoped read/capability access after plant authorization.
 */
export function canViewWorkOrder(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  if (hasWorkOrderViewOverride(session)) return true;

  const userId = session.userId;
  if (workOrder.assignedTo === userId) return true;
  if (workOrder.teamLeaderId === userId) return true;
  if (workOrder.assignedSupervisorId === userId) return true;
  if (workOrder.plannerId === userId) return true;
  if (workOrder.teamMembers?.some((member) => member.userId === userId)) return true;

  const requesterId = workOrder.maintenanceRequest?.requestedBy
    ?? workOrder.maintenanceRequest?.requester?.id
    ?? null;
  return requesterId === userId;
}

/**
 * Generic WO edits are management/planning controls, not technician execution
 * writes. Execution actors use dedicated task/execution/time/resource endpoints.
 */
export function hasWorkOrderManagementOverride(session: SessionData): boolean {
  return isAdmin(session)
    || session.roles.some((role) => MANAGEMENT_OVERRIDE_ROLES.has(role));
}

export function canManageWorkOrder(
  session: SessionData,
  workOrder: Pick<WorkOrderAccessSnapshot, 'assignedSupervisorId' | 'plannerId'>,
): boolean {
  if (hasWorkOrderManagementOverride(session)) return true;
  return workOrder.assignedSupervisorId === session.userId
    || workOrder.plannerId === session.userId;
}

const PLANNER_ROLES = new Set(['planner', 'maintenance_planner']);
const WAITING_STATES = new Set([
  'waiting_parts',
  'waiting_tools',
  'waiting_shutdown',
  'waiting_permit',
]);
const ACTIVE_SUPERVISOR_CANCEL_STATES = new Set([
  'in_progress',
  'waiting_parts',
  'waiting_tools',
  'waiting_shutdown',
  'waiting_permit',
  'on_hold',
  'pending_handover',
]);

function hasPlannerRole(session: SessionData): boolean {
  return session.roles.some((role) => PLANNER_ROLES.has(role));
}

export function isAccountablePlanner(
  session: SessionData,
  workOrder: Pick<WorkOrderAccessSnapshot, 'plannerId' | 'assignedBy'>,
): boolean {
  if (workOrder.plannerId === session.userId) return true;
  return !workOrder.plannerId
    && workOrder.assignedBy === session.userId
    && hasPlannerRole(session);
}

export function isAssignedExecutionLeader(
  session: SessionData,
  workOrder: Pick<WorkOrderAccessSnapshot, 'assignedTo' | 'teamLeaderId' | 'teamMembers'>,
): boolean {
  if (workOrder.assignedTo === session.userId || workOrder.teamLeaderId === session.userId) return true;
  return Boolean(workOrder.teamMembers?.some(
    (member) => member.userId === session.userId && member.role === 'team_leader',
  ));
}

export function canStartWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  // Starting execution opens labor time. Management authority alone must never
  // impersonate an execution worker.
  return isAssignedExecutionLeader(session, workOrder);
}

export function canCompleteWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  if (hasWorkOrderManagementOverride(session)) return true;

  const isAssignee = workOrder.assignedTo === session.userId;
  const isTeamLeader =
    workOrder.teamLeaderId === session.userId
    || Boolean(workOrder.teamMembers?.some(
      (member) => member.userId === session.userId && member.role === 'team_leader',
    ));

  const extraTeamMembers = new Set(
    (workOrder.teamMembers || [])
      .map((member) => member.userId)
      .filter((userId) => userId !== workOrder.assignedTo),
  );
  const isMultiTech = workOrder.assignedTo
    ? extraTeamMembers.size >= 1
    : extraTeamMembers.size >= 2;

  return isMultiTech ? isTeamLeader : isAssignee;
}

export function canVerifyWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  return hasWorkOrderManagementOverride(session)
    || workOrder.assignedSupervisorId === session.userId;
}

export function canCloseWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  return hasWorkOrderManagementOverride(session)
    || workOrder.plannerId === session.userId;
}

export function canPlanWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  return hasWorkOrderManagementOverride(session)
    || isAccountablePlanner(session, workOrder);
}

export function canAssignWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  return hasWorkOrderManagementOverride(session)
    || isAccountablePlanner(session, workOrder)
    || workOrder.assignedSupervisorId === session.userId;
}

function hasExecutionControlOverride(session: SessionData): boolean {
  return isAdmin(session) || session.roles.includes('maintenance_manager');
}

export function canPlaceWorkOrderInWaitingStateForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
  targetStatus: string,
): boolean {
  if (targetStatus === 'on_hold') {
    return hasExecutionControlOverride(session)
      || workOrder.assignedSupervisorId === session.userId;
  }

  return hasExecutionControlOverride(session)
    || workOrder.plannerId === session.userId
    || isAssignedExecutionLeader(session, workOrder);
}

export function canResumeWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  if (workOrder.status === 'pending_handover') {
    return hasExecutionControlOverride(session)
      || workOrder.handoverReceiverId === session.userId;
  }

  if (workOrder.status === 'on_hold') {
    return hasExecutionControlOverride(session)
      || workOrder.assignedSupervisorId === session.userId;
  }

  return hasExecutionControlOverride(session)
    || workOrder.plannerId === session.userId
    || isAssignedExecutionLeader(session, workOrder);
}

export function canInitiateWorkOrderHandoverForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  return hasExecutionControlOverride(session)
    || workOrder.assignedSupervisorId === session.userId
    || isAssignedExecutionLeader(session, workOrder);
}

export function canCancelWorkOrderForActor(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
): boolean {
  if (hasWorkOrderManagementOverride(session)) return true;

  const status = workOrder.status || '';
  if (status === 'assigned') {
    return isAccountablePlanner(session, workOrder)
      || workOrder.assignedSupervisorId === session.userId;
  }
  if (ACTIVE_SUPERVISOR_CANCEL_STATES.has(status)) {
    return workOrder.assignedSupervisorId === session.userId;
  }
  return isAccountablePlanner(session, workOrder);
}

function hasWorkOrderTransitionPermission(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
  toStatus: string,
): boolean {
  if (isAdmin(session)) return true;

  switch (toStatus) {
    case 'requested':
    case 'approved':
    case 'planned':
      return hasPermission(session, 'work_orders.update');
    case 'assigned':
      return hasPermission(session, 'work_orders.assign_supervisor')
        || hasPermission(session, 'work_orders.assign_technician');
    case 'completed':
      return hasPermission(session, 'work_orders.complete');
    case 'verified':
      return hasPermission(session, 'work_orders.verify');
    case 'closed':
      return hasPermission(session, 'work_orders.close');
    case 'cancelled':
      return hasPermission(session, 'work_orders.cancel');
    case 'on_hold':
    case 'waiting_parts':
    case 'waiting_tools':
    case 'waiting_shutdown':
    case 'waiting_permit':
    case 'pending_handover':
      return hasPermission(session, 'work_orders.update')
        || hasPermission(session, 'work_orders.start');
    case 'in_progress':
      if (workOrder.status === 'assigned') {
        return hasPermission(session, 'work_orders.start');
      }
      if (workOrder.status === 'completed' || workOrder.status === 'verified') {
        return hasPermission(session, 'work_orders.verify');
      }
      return hasPermission(session, 'work_orders.update')
        || hasPermission(session, 'work_orders.start');
    default:
      return hasPermission(session, 'work_orders.update');
  }
}

/**
 * Relationship-aware capability filter layered on top of the state-machine
 * role rule. The state machine decides whether a transition exists for a role;
 * this helper decides whether this specific actor owns the corresponding action
 * on this specific work order and has the endpoint permission required to
 * execute it.
 */
export function canPerformWorkOrderTransition(
  session: SessionData,
  workOrder: WorkOrderAccessSnapshot,
  toStatus: string,
): boolean {
  if (!hasWorkOrderTransitionPermission(session, workOrder, toStatus)) return false;

  switch (toStatus) {
    case 'requested':
    case 'approved':
    case 'planned':
      return canPlanWorkOrderForActor(session, workOrder);
    case 'assigned':
      return canAssignWorkOrderForActor(session, workOrder);
    case 'completed':
      return canCompleteWorkOrderForActor(session, workOrder);
    case 'verified':
      return canVerifyWorkOrderForActor(session, workOrder);
    case 'closed':
      return canCloseWorkOrderForActor(session, workOrder);
    case 'on_hold':
      return canPlaceWorkOrderInWaitingStateForActor(session, workOrder, 'on_hold');
    case 'waiting_parts':
    case 'waiting_tools':
    case 'waiting_shutdown':
    case 'waiting_permit':
      return canPlaceWorkOrderInWaitingStateForActor(session, workOrder, toStatus);
    case 'pending_handover':
      return canInitiateWorkOrderHandoverForActor(session, workOrder);
    case 'in_progress':
      if (workOrder.status === 'assigned') {
        return canStartWorkOrderForActor(session, workOrder);
      }
      if (workOrder.status === 'completed' || workOrder.status === 'verified') {
        return canVerifyWorkOrderForActor(session, workOrder);
      }
      if (workOrder.status === 'on_hold' || WAITING_STATES.has(workOrder.status || '') || workOrder.status === 'pending_handover') {
        return canResumeWorkOrderForActor(session, workOrder);
      }
      return isAssignedExecutionLeader(session, workOrder);
    case 'cancelled':
      return canCancelWorkOrderForActor(session, workOrder);
    default:
      return canManageWorkOrder(session, workOrder);
  }
}
