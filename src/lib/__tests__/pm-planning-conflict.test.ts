import { describe,expect,it } from 'vitest';
import { analyzePmPlanningConflicts,type PlannedPmWorkOrder } from '@/lib/pm-planning-conflict';
const a:PlannedPmWorkOrder={
 id:'wo-1',woNumber:'WO-001',assetId:'machine-1',assetName:'Mercerizer C314',
 plantId:'plant-1',status:'planned',plannedStart:'2026-11-10T09:00:00Z',
 plannedEnd:'2026-11-10T12:00:00Z',technicianId:'tech-1',teamLeaderId:'lead-1',
 equipmentStates:['running'],
};
const row=(id:string,changes:Partial<PlannedPmWorkOrder>={})=>({
 ...a,id,woNumber:id,...changes,
});
describe('enterprise PM work-order conflict analysis',()=>{
 it('flags incompatible running and standstill tasks scheduled on the same machine',()=>{
   const r=analyzePmPlanningConflicts([a,row('wo-2',{equipmentStates:['standstill'],technicianId:'tech-2',teamLeaderId:'lead-2'})]);
   expect(r.conflicts.map(x=>x.code)).toEqual(['incompatible_machine_state']);
   expect(r.conflicts[0]).toMatchObject({severity:'high',overlapStart:'2026-11-10T09:00:00.000Z'});
 });
 it('marks parallel same-state maintenance as review rather than an automatic execution veto',()=>{
   const r=analyzePmPlanningConflicts([a,row('wo-2',{technicianId:'tech-2',teamLeaderId:'lead-2'})]);
   expect(r.conflicts).toMatchObject([{code:'parallel_machine_work',severity:'review'}]);
 });
 it('identifies double-booked technician across distinct machines and plants visible to an authorized planner',()=>{
   const r=analyzePmPlanningConflicts([a,row('wo-2',{assetId:'machine-2',plantId:'plant-2',technicianId:'tech-1',teamLeaderId:null})]);
   expect(r.conflicts.map(x=>x.code)).toEqual(['technician_double_booked']);
 });
 it('allows adjacent maintenance windows with no overlap',()=>{
   const r=analyzePmPlanningConflicts([a,row('wo-2',{plannedStart:a.plannedEnd,plannedEnd:'2026-11-10T14:00:00Z'})]);
   expect(r.conflicts).toEqual([]);
 });
 it('detects multiple warnings without fabricating schedule conflict for missing windows',()=>{
   const r=analyzePmPlanningConflicts([
      a,row('missing',{plannedEnd:null}),row('invalid',{plannedStart:'2026-11-11T11:00:00Z',plannedEnd:'2026-11-11T10:00:00Z'}),
   ]);
   expect(r.windowIssues.map(x=>x.code)).toEqual(['missing_end','invalid_window']);
   expect(r.conflicts).toEqual([]);
 });
 it('flags mixed running/standstill inside one WO as a job-plan problem',()=>{
   const r=analyzePmPlanningConflicts([{...a,equipmentStates:['running','standstill']}]);
   expect(r.windowIssues).toMatchObject([{code:'mixed_operating_states'}]);
 });
 it('does not report completed or cancelled work orders as conflicting upcoming jobs',()=>{
   const r=analyzePmPlanningConflicts([a,row('closed',{status:'completed'}),row('cancel',{status:'cancelled'})]);
   expect(r.evaluated).toBe(1);
   expect(r.conflicts).toEqual([]);
 });
 it('does not double-count duplicate work order identities',()=>{
   const r=analyzePmPlanningConflicts([a,a]);
   expect(r.evaluated).toBe(1);
   expect(r.conflicts).toEqual([]);
 });
 it('sorts high conflicts before advisory issues and never changes dates',()=>{
   const r=analyzePmPlanningConflicts([a,row('wo-2',{equipmentStates:['standstill'],technicianId:'tech-2',teamLeaderId:'lead-2'}),row('wo-3',{assetId:'other',technicianId:'tech-1',teamLeaderId:'lead-3'})]);
   expect(r.conflicts[0].severity).toBe('high');
   expect(r.conflicts.some(x=>x.code==='technician_double_booked')).toBe(true);
 });
});
