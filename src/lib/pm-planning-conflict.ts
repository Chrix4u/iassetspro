/** Read-only PM planned-work-order overlap analysis.
 * A pair is a potential coordination issue, NOT an automatic execution veto.
 * No assumption of staff attendance, permits, work authorization or stock.
 */
export interface PlannedPmWorkOrder {
  id: string;
  woNumber: string;
  assetId: string | null;
  assetName: string;
  plantId: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  technicianId: string | null;
  teamLeaderId: string | null;
  equipmentStates: string[];
}
export type PmPlanningConflictCode =
  | 'incompatible_machine_state'
  | 'parallel_machine_work'
  | 'technician_double_booked'
  | 'team_leader_overlap';
export type PmPlanningSeverity = 'high' | 'review';
export interface PmPlanningConflict {
  code: PmPlanningConflictCode;
  severity: PmPlanningSeverity;
  firstId: string;
  secondId: string;
  firstWo: string;
  secondWo: string;
  plantId: string;
  assetName: string;
  overlapStart: string;
  overlapEnd: string;
  explanation: string;
}
export interface PmPlanningWindowIssue {
  id: string;
  woNumber: string;
  code: 'missing_start' | 'missing_end' | 'invalid_window' | 'mixed_operating_states';
  message: string;
}
export interface PmPlanningConflictReport {
  evaluated: number;
  conflicts: PmPlanningConflict[];
  windowIssues: PmPlanningWindowIssue[];
  overflow: boolean;
  checkedAt: string;
}
const MAX_CONFLICTS = 4000;
const TERMINAL = new Set(['completed','verified','closed','cancelled']);
type Window = { row: PlannedPmWorkOrder; start: number; end: number };
function readTime(value: string | null): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}
function distinctStates(values: string[]) {
  return [...new Set(values.map(x=>String(x).trim().toLowerCase())
    .filter(x=>x==='running'||x==='standstill'))];
}
function asIso(value: number) { return new Date(value).toISOString(); }
export function analyzePmPlanningConflicts(
  records: readonly PlannedPmWorkOrder[],
  at: Date = new Date(),
): PmPlanningConflictReport {
  const windows: Window[] = [];
  const windowIssues: PmPlanningWindowIssue[] = [];
  const conflicts: PmPlanningConflict[] = [];
  const seenIds = new Set<string>();
  for (const row of records) {
    if (seenIds.has(row.id) || TERMINAL.has(row.status.toLowerCase())) continue;
    seenIds.add(row.id);
    const start = readTime(row.plannedStart);
    const end = readTime(row.plannedEnd);
    if (start === null || end === null) {
      windowIssues.push({
        id: row.id, woNumber: row.woNumber,
        code: start === null ? 'missing_start' : 'missing_end',
        message: start === null ? 'Planned start is missing or invalid' :
          'Planned end is missing or invalid',
      });
      continue;
    }
    if (end <= start) {
      windowIssues.push({ id: row.id, woNumber: row.woNumber,
        code: 'invalid_window', message: 'Planned end must be after planned start' });
      continue;
    }
    const states = distinctStates(row.equipmentStates);
    if (states.length > 1) {
      windowIssues.push({id:row.id,woNumber:row.woNumber,code:'mixed_operating_states',
        message:'This work order mixes Running and Standstill tasks. Planner must review the job pack.'});
    }
    windows.push({ row, start, end });
  }
  windows.sort((a,b)=>a.start-b.start || a.row.id.localeCompare(b.row.id));
  let overflow = false;
  const add = (code:PmPlanningConflictCode,severity:PmPlanningSeverity,a:Window,b:Window,reason:string) => {
    if (conflicts.length >= MAX_CONFLICTS) {overflow=true;return;}
    conflicts.push({
      code,severity,firstId:a.row.id,secondId:b.row.id,firstWo:a.row.woNumber,secondWo:b.row.woNumber,
      plantId:a.row.plantId,assetName:a.row.assetName || b.row.assetName,
      overlapStart:asIso(Math.max(a.start,b.start)),overlapEnd:asIso(Math.min(a.end,b.end)),
      explanation:reason,
    });
  };
  outer: for(let i=0;i<windows.length;i++){
    const a=windows[i];
    for(let j=i+1;j<windows.length;j++){
      const b=windows[j];
      if(b.start>=a.end)break;
      // A user authorized across plants may see cross-plant resource
      // double-booking, but never infer simultaneous physical machine work
      // across two unrelated plants.
      const samePlant=a.row.plantId===b.row.plantId;
      const sameMachine=Boolean(samePlant && a.row.assetId && a.row.assetId===b.row.assetId);
      if(sameMachine){
        const left=distinctStates(a.row.equipmentStates);
        const right=distinctStates(b.row.equipmentStates);
        const opposite=left.some(x=>right.some(y=>x!==y));
        add(opposite?'incompatible_machine_state':'parallel_machine_work',opposite?'high':'review',
          a,b,opposite?'Same machine is scheduled Running and Standstill at overlapping times':
          'Same machine has overlapping PM work orders; confirm a coordinated shutdown or parallel job plan');
      }
      if(a.row.technicianId && a.row.technicianId===b.row.technicianId){
        add('technician_double_booked','high',a,b,
          'The same assigned technician is scheduled on overlapping PM work orders');
      }
      if(a.row.teamLeaderId && a.row.teamLeaderId===b.row.teamLeaderId){
        add('team_leader_overlap','review',a,b,
          'The same team leader is responsible for overlapping PM work orders');
      }
      if(overflow)break outer;
    }
  }
  const severity = (value:PmPlanningSeverity) => value==='high'?0:1;
  conflicts.sort((a,b)=>severity(a.severity)-severity(b.severity)
    || a.overlapStart.localeCompare(b.overlapStart)
    || a.firstWo.localeCompare(b.firstWo)
    || a.secondWo.localeCompare(b.secondWo)
    || a.code.localeCompare(b.code));
  return {evaluated:seenIds.size,conflicts,windowIssues,overflow,checkedAt:at.toISOString()};
}
