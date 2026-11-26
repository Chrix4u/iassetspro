/** Read-only configuration preflight, never a certificate of installed machine safety. */
export type ReadinessState = 'configured' | 'missing' | 'review';
export interface CommissioningCheck {key:string;title:string;state:ReadinessState;detail:string}
export interface MachineReadinessEvidence {
  nameplate:{manufacturer:string|null;model:string|null;serial:string|null;aiDraft:boolean};
  locationAssignments:number;
  registeredComponents:number;
  uncommissionedComponents:number;
  inspectionParameters:number;
  inspectionParametersNeedingReview:number;
  meterCount:number;
  meterReadingsObserved:number;
  productionMeters:number;
  runtimeMeters:number;
  productionMetersObserved:number;
  runtimeMetersObserved:number;
  actualPhotoViews:string[];
  privateCadApproved:number;
  privateCadPending:number;
  oemSourceAuthenticityCertified:boolean;
  calendarPm:number;
  meterPm:number;
  scheduledShifts:number;
  shiftsWithLeader:number;
  approvedProductionShifts:number;
}
const physicalViews=['front','back','left','right','top','bottom'] as const;
const check=(key:string,title:string,state:ReadinessState,detail:string):CommissioningCheck=>
  ({key,title,state,detail});
export function evaluateMachineCommissioningReadiness(e:MachineReadinessEvidence):{
  checks:CommissioningCheck[];configuredCount:number;totalChecks:number;
  softwarePreflightComplete:boolean;physicalAcceptanceComplete:false;
}{
  const present=(value:string|null)=>Boolean(value?.trim());
  const missingViews=physicalViews.filter(view=>!new Set(e.actualPhotoViews).has(view));
  const nameplateComplete=present(e.nameplate.manufacturer)&&present(e.nameplate.model)&&present(e.nameplate.serial);
  const checks:CommissioningCheck[]=[
    check('identity','Installed machine identity',
      !nameplateComplete?'missing':e.nameplate.aiDraft?'review':'configured',
      !nameplateComplete?'Record manufacturer, exact model and installed nameplate serial':
      e.nameplate.aiDraft?'AI-suggested identity needs independent site verification':
      'Manufacturer, model and serial recorded; compare with the physical nameplate'),
    check('location','Full functional location path',
      e.locationAssignments>0?'configured':'missing',
      e.locationAssignments>0?'Current hierarchy assignment exists':
      'Assign the machine to its exact functional location path'),
    check('hierarchy','Machine assemblies and parts',
      e.registeredComponents===0?'missing':e.uncommissionedComponents>0?'review':'configured',
      e.registeredComponents===0?'Create source-backed assemblies, components and parts':
      e.uncommissionedComponents>0?
        `${e.uncommissionedComponents}/${e.registeredComponents} components remain uncommissioned drafts`:
        `${e.registeredComponents} registered components; validate against engineering parts book`),
    check('parameters','Machine inspection parameters',
      !e.inspectionParameters?'missing':e.nameplate.aiDraft || e.inspectionParametersNeedingReview>0?'review':'configured',
      !e.inspectionParameters?'Set inspection parameters with limits, units and source references':
      e.inspectionParametersNeedingReview>0?
        `${e.inspectionParametersNeedingReview} of ${e.inspectionParameters} parameters need source references or measurement limits; one-sided limits are allowed`:
        `${e.inspectionParameters} defined; verify all manufacturer limits and units`),
    check('meters','Production and runtime meters',
      !e.meterCount?'missing':
      !e.productionMeters || !e.runtimeMeters || !e.productionMetersObserved ||
        !e.runtimeMetersObserved || !e.meterReadingsObserved?'review':'configured',
      !e.meterCount?'Register genuine production/usage and running-hour counters':
      `${e.productionMetersObserved}/${e.productionMeters} output meters and ${e.runtimeMetersObserved}/${e.runtimeMeters} runtime meters have observed readings. ${!e.productionMeters || !e.runtimeMeters ? 'Register both counter types for production commissioning.' : !e.productionMetersObserved || !e.runtimeMetersObserved ? 'Record an observed reading for each counter type.' : 'Verify counter evidence and units.'}`),
    check('photos','Six genuine machine elevations',
      !missingViews.length?'configured':'missing',
      !missingViews.length?'Six uploaded views; ensure photos match this installed machine':
      'Missing actual '+missingViews.join(', ')+' views; AI pictures do not count'),
    check('cad','Source-backed private 3D CAD',
      !e.privateCadApproved?'missing':!e.oemSourceAuthenticityCertified?'review':'configured',
      !e.privateCadApproved?`${e.privateCadPending} draft file(s); source-backed CAD awaits engineering approval`:
      e.oemSourceAuthenticityCertified?'CAD approved and verified manufacturer authenticity recorded':
      `${e.privateCadApproved} approved visualization model(s), but OEM authenticity remains unverified`),
    check('pm','Preventive maintenance frequencies',
      e.calendarPm+e.meterPm?'configured':'missing',
      e.calendarPm+e.meterPm?
        `${e.calendarPm} calendar/time and ${e.meterPm} meter/usage PM schedules`:
        'Configure calendar/time or meter/usage PM using approved engineering procedures'),
    check('shifts','Planner shifts and assigned leaders',
      !e.scheduledShifts?'missing':e.shiftsWithLeader===e.scheduledShifts?'configured':'review',
      !e.scheduledShifts?'Planner must set shifts, production targets and crews':
      `${e.shiftsWithLeader} of ${e.scheduledShifts} upcoming shifts have an eligible leader, active crew and active shift template`),
    check('production','Independently approved production entries',
      e.approvedProductionShifts?'configured':'missing',
      e.approvedProductionShifts?
        `${e.approvedProductionShifts} approved shift report(s); verify PM meter linkage and formula output`:
        'No approved operator submissions yet; missing shifts are not zero output'),
  ];
  const configuredCount=checks.filter(row=>row.state==='configured').length;
  return {checks,configuredCount,totalChecks:checks.length,
    softwarePreflightComplete:configuredCount===checks.length,
    physicalAcceptanceComplete:false};
}
