import { hasPermission, isAdmin, getSession } from '@/lib/auth';

/**
 * An operator's general production-entry permission does not authorize an
 * arbitrary machine/shift. A date-specific planner roster is mandatory.
 */
export function canCoordinateProduction(session: NonNullable<ReturnType<typeof getSession>>): boolean {
  return isAdmin(session) || hasPermission(session,'production_surveys.plan')
    || hasPermission(session,'production_surveys.manage');
}
export function requiresCrewScope(session: NonNullable<ReturnType<typeof getSession>>): boolean {
  return !canCoordinateProduction(session);
}
export function isAssignedCrew(crew: ReadonlyArray<{userId:string}>, userId:string): boolean {
  return crew.some(member=>member.userId===userId);
}
export function validateCrewSelection(raw:unknown): {userIds:string[];leaderUserId:string} {
  if (!Array.isArray(raw) || raw.length===0 || raw.length>60 ||
      !raw.every(x=>typeof x==='string' && x.trim().length>0 && x.length<128)) {
    throw new Error('Assign 1–60 active crew members to this shift');
  }
  const userIds=(raw as string[]).map(x=>x.trim());
  if (new Set(userIds).size!==userIds.length) throw new Error('A worker cannot appear twice on one shift');
  return {userIds,leaderUserId:''};
}
