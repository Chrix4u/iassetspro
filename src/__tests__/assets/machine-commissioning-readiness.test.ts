import {describe,expect,it} from 'vitest';
import {componentInspectionPointNeedsReview,evaluateMachineCommissioningReadiness,type MachineReadinessEvidence} from '@/lib/assets/machine-commissioning-readiness';

const empty:MachineReadinessEvidence={
  nameplate:{manufacturer:null,model:null,serial:null,aiDraft:false},
  locationAssignments:0,registeredComponents:0,uncommissionedComponents:0,
  inspectionParameters:0,inspectionParametersNeedingReview:0,componentInspectionPoints:0,componentInspectionPointsNeedingReview:0,meterCount:0,meterReadingsObserved:0,productionMeters:0,runtimeMeters:0,productionMetersObserved:0,runtimeMetersObserved:0,
  actualPhotoViews:[],privateCadApproved:0,privateCadPending:0,
  oemSourceAuthenticityCertified:false,calendarPm:0,meterPm:0,
  scheduledShifts:0,shiftsWithLeader:0,approvedProductionShifts:0,
};
const state=(data:MachineReadinessEvidence,key:string)=>
  evaluateMachineCommissioningReadiness(data).checks.find(row=>row.key===key)!;
const configured:MachineReadinessEvidence={
  ...empty,
  nameplate:{manufacturer:'OEM',model:'MX-200',serial:'REAL-123',aiDraft:false},
  locationAssignments:1,registeredComponents:13,uncommissionedComponents:0,
  inspectionParameters:7,inspectionParametersNeedingReview:0,componentInspectionPoints:3,componentInspectionPointsNeedingReview:0,meterCount:2,meterReadingsObserved:2,productionMeters:1,runtimeMeters:1,productionMetersObserved:1,runtimeMetersObserved:1,
  actualPhotoViews:['front','back','left','right','top','bottom'],
  privateCadApproved:1,oemSourceAuthenticityCertified:true,
  calendarPm:2,meterPm:1,scheduledShifts:3,shiftsWithLeader:3,
  approvedProductionShifts:3,
};

describe('witnessed machine commissioning preflight semantics',()=>{
  it('fails closed when a machine has no real equipment, production or PM setup',()=>{
    const result=evaluateMachineCommissioningReadiness(empty);
    expect(result.checks).toHaveLength(10);
    expect(result.configuredCount).toBe(0);
    expect(result.softwarePreflightComplete).toBe(false);
    expect(result.physicalAcceptanceComplete).toBe(false);
    expect(state(empty,'production').detail).toContain('not zero');
  });
  it('recognizes exact full location, machine parameters and planner shifts only',()=>{
    expect(state(configured,'location').state).toBe('configured');
    expect(state(configured,'parameters').state).toBe('configured');
    expect(state(configured,'shifts').state).toBe('configured');
    expect(state({...configured,scheduledShifts:4},'shifts').state).toBe('review');
    expect(state({...configured,shiftsWithLeader:0},'shifts').state).toBe('review');
    expect(state({...configured,shiftsWithLeader:0},'shifts').detail).toContain('eligible leader, active crew and active shift template');
    expect(state({...configured,locationAssignments:0},'location').state).toBe('missing');
  });
  it('flags partially defined inspection parameters without marking all setup complete',()=>{
    const partial={...configured,inspectionParametersNeedingReview:2};
    expect(state(partial,'parameters').state).toBe('review');
    expect(state(partial,'parameters').detail).toContain('2 of 7 parameters');
    expect(evaluateMachineCommissioningReadiness(partial).softwarePreflightComplete).toBe(false);
    expect(state(configured,'parameters').state).toBe('configured');
  });
  it('requires applicable part checkpoints and flags incomplete active part evidence',()=>{
    expect(state({...configured,componentInspectionPoints:0},'parameters').state).toBe('review');
    expect(state({...configured,componentInspectionPointsNeedingReview:1},'parameters').detail).toContain('1 of 3 active part checkpoints');
    expect(state({...configured,componentInspectionPointsNeedingReview:1},'parameters').state).toBe('review');
  });
  it('distinguishes valid part measurement limits from invalid or specialized points',()=>{
    const point={inspectionType:'measurement',description:'Manual 7',normalRange:'{"min":0,"max":null,"unit":"bar"}'};
    expect(componentInspectionPointNeedsReview(point)).toBe(false);
    for(const normalRange of [null,'{}','broken','{"min":5,"max":2,"unit":"bar"}','{"min":true,"unit":"bar"}','{"max":5,"unit":""}'])
      expect(componentInspectionPointNeedsReview({...point,normalRange})).toBe(true);
    expect(componentInspectionPointNeedsReview({...point,description:' '})).toBe(true);
    expect(componentInspectionPointNeedsReview({...point,inspectionType:'visual',normalRange:null})).toBe(false);
    expect(componentInspectionPointNeedsReview({...point,inspectionType:'ndt'})).toBe(true);
  });
  it('never treats a proposed AI make/model or uncommissioned parts as engineer approved',()=>{
    const draft={...configured,
      nameplate:{...configured.nameplate,aiDraft:true},
      uncommissionedComponents:4,
    };
    expect(state(draft,'identity').state).toBe('review');
    expect(state(draft,'hierarchy').state).toBe('review');
    expect(state(draft,'parameters').state).toBe('review');
  });
  it('does not invent actual meter observations or OEM authenticity',()=>{
    expect(state({...configured,meterReadingsObserved:0},'meters').state).toBe('review');
    const unauthentic={...configured,privateCadPending:1,oemSourceAuthenticityCertified:false};
    expect(state(unauthentic,'cad').state).toBe('review');
    expect(state(unauthentic,'cad').detail).toContain('unverified');
    expect(state({...configured,privateCadApproved:0,privateCadPending:4},'cad').state).toBe('missing');
  });
  it('never counts a model as usable if private storage is disabled or unsafe',()=>{
    for(const cadStorageState of ['unconfigured','unsafe'] as const){
      const evidence={...configured,cadStorageState};
      expect(state(evidence,'cad').state).toBe('missing');
      expect(state(evidence,'cad').detail).toContain('administrator');
      expect(evaluateMachineCommissioningReadiness(evidence).softwarePreflightComplete).toBe(false);
    }
    expect(state({...configured,cadStorageState:'ready'},'cad').state).toBe('configured');
  });
  it('requires actual observed output and runtime counters, not an unrelated meter reading',()=>{
    expect(state({...configured,productionMeters:0,productionMetersObserved:0},'meters').state).toBe('review');
    expect(state({...configured,runtimeMeters:0,runtimeMetersObserved:0},'meters').state).toBe('review');
    expect(state({...configured,productionMetersObserved:0},'meters').state).toBe('review');
    expect(state({...configured,runtimeMetersObserved:0},'meters').state).toBe('review');
    expect(state(configured,'meters').state).toBe('configured');
  });
  it('requires all six distinct real elevations, not six copies of one angle',()=>{
    expect(state({...configured,actualPhotoViews:['front','front','front','front','front','front']},'photos').state)
      .toBe('missing');
    expect(state(configured,'photos').state).toBe('configured');
    expect(state({...configured,actualPhotoViews:['front','back','left','right','top','other']},'photos').detail)
      .toContain('bottom');
  });
  it('uses only calendar/time and meter/usage types for preventive maintenance',()=>{
    expect(state({...configured,calendarPm:0,meterPm:0},'pm').state).toBe('missing');
    expect(state({...configured,calendarPm:0,meterPm:1},'pm').state).toBe('configured');
    expect(state({...configured,calendarPm:1,meterPm:0},'pm').state).toBe('configured');
  });
  it('does not misrepresent even a fully configured software model as physical acceptance',()=>{
    const all=evaluateMachineCommissioningReadiness(configured);
    expect(all.configuredCount).toBe(all.totalChecks);
    expect(all.softwarePreflightComplete).toBe(true);
    expect(all.physicalAcceptanceComplete).toBe(false);
  });
});
