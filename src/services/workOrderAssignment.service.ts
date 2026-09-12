export type WorkOrderTeamMemberInput = {
  userId: string;
  role?: string;
};

export type PlannedWorkOrderTeamMember = {
  userId: string;
  role: string;
  isLeader: boolean;
};

export type DirectAssignmentPlan = {
  executionMemberIds: string[];
  effectiveAssignedTo: string;
  effectiveTeamLeaderId: string;
  members: PlannedWorkOrderTeamMember[];
};

export type DirectAssignmentPlanResult =
  | { ok: true; plan: DirectAssignmentPlan }
  | { ok: false; error: string };

function normalizeUserId(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNonLeaderRole(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized === 'team_leader') return 'assistant';
  return normalized;
}

/**
 * Build the authoritative execution roster for a direct work-order assignment.
 *
 * `assignedTo` and `teamMembers` are two input shapes for the same execution
 * team. The planner collapses them into one unique roster, requires exactly one
 * explicit leader whenever more than one technician is present, and prevents a
 * non-selected member from smuggling an extra `team_leader` role through the
 * optional role field.
 */
export function buildDirectAssignmentPlan(
  assignedTo?: string,
  teamLeaderId?: string,
  teamMembers?: WorkOrderTeamMemberInput[],
): DirectAssignmentPlanResult {
  const normalizedAssignedTo = normalizeUserId(assignedTo);
  const normalizedLeader = normalizeUserId(teamLeaderId);
  const requestedRoleByUserId = new Map<string, string | undefined>();
  const executionMemberIds: string[] = [];

  const addMember = (userId: string | null, requestedRole?: string) => {
    if (!userId) return;
    if (!executionMemberIds.includes(userId)) executionMemberIds.push(userId);
    if (!requestedRoleByUserId.has(userId)) requestedRoleByUserId.set(userId, requestedRole);
  };

  addMember(normalizedAssignedTo);

  for (const member of teamMembers ?? []) {
    const userId = normalizeUserId(member.userId);
    if (!userId) {
      return { ok: false, error: 'Each team member must have a userId' };
    }
    addMember(userId, member.role);
  }

  if (executionMemberIds.length === 0) {
    return { ok: false, error: 'assignedTo or teamMembers is required for direct assignment' };
  }

  let effectiveTeamLeaderId: string;
  if (executionMemberIds.length === 1) {
    effectiveTeamLeaderId = executionMemberIds[0];
    if (normalizedLeader && normalizedLeader !== effectiveTeamLeaderId) {
      return { ok: false, error: 'teamLeaderId must be one of the assigned execution members' };
    }
  } else {
    if (!normalizedLeader) {
      return { ok: false, error: 'teamLeaderId is required when more than one technician is assigned' };
    }
    if (!executionMemberIds.includes(normalizedLeader)) {
      return { ok: false, error: 'teamLeaderId must be one of the assigned execution members' };
    }
    effectiveTeamLeaderId = normalizedLeader;
  }

  const effectiveAssignedTo = normalizedAssignedTo ?? executionMemberIds[0];
  const members = executionMemberIds.map((userId) => {
    const isLeader = userId === effectiveTeamLeaderId;
    return {
      userId,
      isLeader,
      role: isLeader
        ? 'team_leader'
        : normalizeNonLeaderRole(requestedRoleByUserId.get(userId)),
    };
  });

  return {
    ok: true,
    plan: {
      executionMemberIds,
      effectiveAssignedTo,
      effectiveTeamLeaderId,
      members,
    },
  };
}
