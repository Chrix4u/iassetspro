import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assignWO, startWO, logTime, completeWO, verifyWO, closeWO, getWO } from './repairs/helpers/api';

const creds = {
  admin: ['admin', 'admin123'],
  manager: ['prod_mgr1', 'password123'],
  operator: ['operator1', 'password123'],
  operatorOtherPlant: ['op2', 'password123'],
  planner: ['planner1', 'password123'],
  technician: ['tech1', 'password123'],
  supervisor: ['supervisor1', 'password123'],
} as const;
async function actor(request:APIRequestContext,role:keyof typeof creds) {
  const [username,password]=creds[role];
  const response=await request.post('/api/auth/login',{data:{username,password}});
  expect(response.status()).toBe(200);
  const body=await response.json();
  expect(body.success).toBe(true);
  return {Authorization:'Bearer '+String(body.data.token)};
}

// Prevent fixture writes to a production database or remote origin.
test('isolated UAT: planner standards, operator entry, independent approval and PM runtime',async ({request})=>{
  test.skip(process.env.CI !== 'true' || !process.env.DATABASE_URL?.includes('/platform_e2e?schema=public') ||
    !/^http:\/\/127\.0\.0\.1:3000$/.test(process.env.PLAYWRIGHT_BASE_URL||''),
    'Only the isolated platform E2E CI job may create production-survey test records');
  test.setTimeout(90_000);
  const [admin,manager,operator,operatorOtherPlant]=await Promise.all([
    actor(request,'admin'),actor(request,'manager'),actor(request,'operator'),actor(request,'operatorOtherPlant')]);
  const assetsResponse=await request.get('/api/assets?limit=50',{headers:operator});
  expect(assetsResponse.status()).toBe(200);
  const assets=(await assetsResponse.json()).data as Array<{id:string;plantId:string}>;
  const asset=assets.find(a=>a.id&&a.plantId);
  expect(asset).toBeTruthy();
  const assetId=asset!.id,plantId=asset!.plantId;
  const crewResponse=await request.get('/api/production-surveys/crew?plantId='+plantId,{headers:manager});
  expect(crewResponse.status()).toBe(200);
  const workers=(await crewResponse.json()).data as Array<{id:string;username:string}>;
  const operatorId=workers.find(worker=>worker.username==='operator1')?.id;
  const managerId=workers.find(worker=>worker.username==='prod_mgr1')?.id;
  expect(operatorId).toBeTruthy();
  expect(managerId).toBeTruthy();
  const suffix=String(Date.now()),runtimeName='CI Runtime '+suffix,outputName='CI Output '+suffix;
  const createMeter=async(name:string,meterType:string,unit:string,initialValue:number)=>{
    const response=await request.post('/api/assets/'+assetId+'/meters',{
      headers:admin,data:{name,meterType,unit,initialValue}});
    expect(response.status()).toBe(201);
    return (await response.json()).data as {id:string};
  };
  const runtime=await createMeter(runtimeName,'runtime','hours',120);
  const output=await createMeter(outputName,'production','yards',0);
  const designCode='CI-'+suffix;
  const registerDesign=await request.post('/api/production-surveys/products',{
    headers:manager,data:{assetId,code:designCode,name:'CI sample fabric',unit:'yards'}});
  expect(registerDesign.status()).toBe(200);
  expect((await registerDesign.json()).data.code).toBe(designCode);
  const shiftResponse=await request.post('/api/production-surveys/setup',{
    headers:manager,data:{plantId,name:'CI Survey '+suffix,code:'ci_'+suffix}});
  expect(shiftResponse.status()).toBe(201);
  const shiftTemplateId=(await shiftResponse.json()).data.id as string;
  // Completed yesterday: ensures the 'no submissions before shift end' rule
  // is exercised without depending on when CI executes.
  const productionDate=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const plan={
    assetId,shiftTemplateId,productionDate,plannedShiftsPerDay:2,
    shiftHours:8,availableMinutes:480,plannedBreakMinutes:30,
    startsAt:'00:00',endsAt:'08:00',targetQuantity:1500,unit:'yards',
    productCode:designCode,crewUserIds:[operatorId!],leaderUserId:operatorId!,
    standardUtilizationPct:85,standardSpeed:4,
  };
  expect((await request.post('/api/production-surveys/plans',{
    headers:operator,data:plan})).status()).toBe(403);
  expect((await request.post('/api/production-surveys/plans',{
    headers:manager,data:plan})).status()).toBe(200);
  // Another scheduled shift is assigned only to the manager. The operator must
  // not see it, and a crafted POST must not bypass this roster restriction.
  const anotherShift=await request.post('/api/production-surveys/setup',{
    headers:manager,data:{plantId,name:'CI Other Shift '+suffix,code:'ci_other_'+suffix}});
  expect(anotherShift.status()).toBe(201);
  const otherShiftId=(await anotherShift.json()).data.id as string;
  const otherPlan={...plan,shiftTemplateId:otherShiftId,startsAt:'08:00',
    endsAt:'16:00',crewUserIds:[managerId!],leaderUserId:managerId!};
  expect((await request.post('/api/production-surveys/plans',{headers:manager,data:otherPlan})).status()).toBe(200);
  const roster=await request.get('/api/production-surveys/plans?assetId='+assetId+'&date='+productionDate,{headers:operator});
  expect(roster.status()).toBe(200);
  expect((await roster.json()).data.map((item:{shiftTemplateId:string})=>item.shiftTemplateId))
    .toEqual([shiftTemplateId]);
  const setup=await request.get('/api/production-surveys/setup?assetId='+assetId+'&date='+productionDate,{headers:operator});
  expect(setup.status()).toBe(200);
  const setupBody=(await setup.json()).data;
  expect(setupBody.shifts.map((s:{id:string})=>s.id)).toEqual([shiftTemplateId]);
  expect(setupBody.runtimeMeters.some((m:{id:string})=>m.id===runtime.id)).toBe(true);
  expect(setupBody.meters.some((m:{id:string})=>m.id===output.id)).toBe(true);
  // A report of scheduled-only shifts must show the target, not fabricate zero
  // units of production or a zero-percent achievement rate.
  const plannedReport=await request.get('/api/production-surveys/report?assetId='+assetId+
    '&group=day&from='+productionDate+'&to='+productionDate,{headers:manager});
  expect(plannedReport.status()).toBe(200);
  const plannedRows=(await plannedReport.json()).data as Array<{
    shifts:number;plannedShifts:number;target:number;approvedOutputReported:boolean;
    targetAchievementPct:number|null
  }>;
  expect(plannedRows.some(row=>row.shifts===0&&row.plannedShifts===2&&
    row.target===3000&&!row.approvedOutputReported&&row.targetAchievementPct===null)).toBe(true);
  const pmSchedule=await request.post('/api/pm-schedules',{
    headers:admin,data:{
      title:'CI Runtime Maintenance '+suffix,assetId,frequencyType:'meter',
      frequencyValue:5,frequencyUnit:'hours',meterName:runtimeName,
      estimatedDuration:1,autoGenerateWO:false,leadDays:0,
    }});
  expect(pmSchedule.status()).toBe(201);
  // An assigned operator cannot submit a shift before its scheduled end.
  // Use tomorrow, independent of the CI runner's execution time.
  const futurePlan={...plan,productionDate:new Date(Date.now()+86400000).toISOString().slice(0,10)};
  const futureSchedule=await request.post('/api/production-surveys/plans',{
    headers:manager,data:futurePlan,
  });
  expect(futureSchedule.status()).toBe(200);
  const prematureEntry=await request.post('/api/production-surveys',{headers:operator,data:{
    ...futurePlan,outputQuantity:10,defectiveQuantity:0,
    breakMinutes:0,repairMinutes:0,inputDeliveryMinutes:0,
    changeoverMinutes:0,startupCleaningMinutes:0,otherMinutes:0,preventiveMinutes:0,
  }});
  expect(prematureEntry.status()).toBe(400);
  expect((await prematureEntry.json()).error).toMatch(/shift has not ended/i);
  const unauthorizedShift=await request.post('/api/production-surveys',{headers:operator,data:{
    ...otherPlan,outputQuantity:10,defectiveQuantity:0,
    breakMinutes:0,repairMinutes:0,inputDeliveryMinutes:0,
    changeoverMinutes:0,startupCleaningMinutes:0,otherMinutes:0,preventiveMinutes:0,
  }});
  expect(unauthorizedShift.status()).toBe(400);
  expect((await unauthorizedShift.json()).error).toMatch(/not assigned/i);
  const otherPlantAttempt=await request.post('/api/production-surveys',{headers:operatorOtherPlant,data:{
    ...plan,outputQuantity:10,breakMinutes:0,repairMinutes:0,inputDeliveryMinutes:0,
    changeoverMinutes:0,startupCleaningMinutes:0,otherMinutes:0,preventiveMinutes:0,
  }});
  expect(otherPlantAttempt.status()).toBe(403);
  const entry=await request.post('/api/production-surveys',{headers:operator,data:{
    ...plan,assetMeterId:output.id,runtimeMeterId:runtime.id,
    runtimeCounterHours:125.5,runtimeEvidence:'Physical panel hour-meter display',
    outputQuantity:1200,defectiveQuantity:75,startDelayMinutes:10,
    targetQuantity:99999,availableMinutes:999,
    breakMinutes:30,repairMinutes:45,inputDeliveryMinutes:10,
    changeoverMinutes:5,startupCleaningMinutes:15,
    otherMinutes:0,preventiveMinutes:0,notes:'Isolated UAT data',
  }});
  expect(entry.status()).toBe(201);
  const record=(await entry.json()).data;
  expect(record.targetQuantity).toBe(1500);
  expect(record.productCode).toBe(designCode);
  expect(record.defectiveQuantity).toBe(75);
  expect(record.availableMinutes).toBe(480);
  expect(record.runtimeCounterHours).toBe(125.5);
  const review='/api/production-surveys/'+record.id+'/review';
  expect((await request.post(review,{headers:operator,data:{action:'approve'}})).status()).toBe(403);
  const approved=await request.post(review,{headers:manager,data:{action:'approve'}});
  expect(approved.status()).toBe(200);
  const verified=(await approved.json()).data;
  expect(verified.meterPosted).toBe(true);
  expect(verified.runtimeMeterPosted).toBe(true);
  expect(verified.record.runtimeMeterReadingId).toBeTruthy();
  const repeated=await request.post(review,{headers:manager,data:{action:'approve'}});
  expect(repeated.status()).toBe(200);
  expect((await repeated.json()).data.duplicate).toBe(true);
  const meterRes=await request.get('/api/assets/'+assetId+'/meters',{headers:admin});
  expect(meterRes.status()).toBe(200);
  const all=(await meterRes.json()).data as Array<{id:string;currentValue:number}>;
  expect(all.find(m=>m.id===runtime.id)?.currentValue).toBe(125.5);
  expect(all.find(m=>m.id===output.id)?.currentValue).toBe(1200);
  const progress=await request.get('/api/production-surveys/pm-progress?assetId='+assetId,{headers:manager});
  expect(progress.status()).toBe(200);
  const thresholds=(await progress.json()).data.thresholds as Array<{meterName:string;state:string;remaining:number}>;
  expect(thresholds.find(t=>t.meterName===runtimeName)?.state).toBe('due');
  const report=await request.get('/api/production-surveys/report?assetId='+assetId+
    '&group=day&from='+productionDate+'&to='+productionDate,{headers:manager});
  expect(report.status()).toBe(200);
  const daily=(await report.json()).data as Array<{
    output:number;target:number;productiveMinutes:number;goodOutput:number;defects:number;
    plannedShifts:number;unapprovedOrMissingShifts:number;targetAchievementPct:number
  }>;
  expect(daily.some(r=>r.output>=1200&&r.target>=3000&&r.productiveMinutes>=375
    &&r.goodOutput>=1125&&r.defects>=75&&r.plannedShifts>=2
    &&r.unapprovedOrMissingShifts>=1&&r.targetAchievementPct<=40)).toBe(true);
});


test('isolated demonstration: fresh machine, 5500 yards, task-level PM generation and verified closeout',async ({request,page,context},testInfo)=>{
  if(process.env.CI!=='true'||!process.env.DATABASE_URL?.includes('/platform_e2e?schema=public')||
    process.env.PLAYWRIGHT_BASE_URL!=='http://127.0.0.1:3000'){
    if(process.env.CI)throw new Error('Demonstration must use isolated platform CI');
    test.skip(true,'Only isolated platform CI may create demonstration fixtures');
  }
  test.setTimeout(240_000);
  const [admin,manager,operator,planner,technician,supervisor,otherPlant]=await Promise.all([actor(request,'admin'),actor(request,'manager'),actor(request,'operator'),actor(request,'planner'),actor(request,'technician'),actor(request,'supervisor'),actor(request,'operatorOtherPlant')]);
  const seedAssets=await request.get('/api/assets?limit=50',{headers:operator});
  expect(seedAssets.status()).toBe(200);
  const plantId=(await seedAssets.json()).data.find((a:{plantId?:string})=>a.plantId)?.plantId as string;
  expect(plantId).toBeTruthy();
  const categoryResponse=await request.get('/api/asset-categories',{headers:admin});
  expect(categoryResponse.status()).toBe(200);
  const categoryId=(await categoryResponse.json()).data[0]?.id as string;
  expect(categoryId).toBeTruthy();
  const suffix=Date.now().toString();
  // Separate synthetic hierarchy: never replace the existing primary system.
  const hierarchy=await request.post('/api/hierarchy-systems',{headers:admin,data:{
    name:'Demo acceptance '+suffix,code:'GTPA'+suffix,purpose:'functional_location',codeMode:'generated',
    isPrimary:false,levels:[{order:1,label:'Installation point',allowAssetAssignment:true}],
  }});
  expect(hierarchy.status(),await hierarchy.text()).toBe(201);
  const system=(await hierarchy.json()).data;
  const location=await request.post('/api/functional-locations',{headers:admin,data:{
    hierarchySystemId:system.id,hierarchyLevelId:system.levels[0].id,plantId,
    name:'Demo installation '+suffix,codeSegment:'GTPA'+suffix,
  }});
  expect(location.status(),await location.text()).toBe(201);
  const functionalLocationId=(await location.json()).data.id;
  const outputName='Demo Cumulative Fabric Output '+suffix,runtimeName='Demo Running Hours '+suffix;
  const created=await request.post('/api/assets',{headers:admin,data:{
    name:'Synthetic demo stenter '+suffix,assetTag:'DEMO-ST-'+suffix,categoryId,plantId,functionalLocationId,
    acquisitionCondition:'new',status:'operational',criticality:'high',
    manufacturer:'Synthetic CI manufacturer',model:'Synthetic CI stenter',serialNumber:'CI-DEMO-'+suffix,
    machineParameters:[{name:'Chamber temperature',inspectionType:'measurement',unit:'C',min:150,max:180,reference:'Synthetic test fixture only'}],
    meters:[{name:outputName,meterType:'production',unit:'yards',initialValue:0},
      {name:runtimeName,meterType:'runtime',unit:'hours',initialValue:0}],
  }});
  expect(created.status(),await created.text()).toBe(201);
  const assetId=(await created.json()).data.id as string;
  const readinessUrl='/api/assets/'+assetId+'/commissioning-readiness';
  const readiness=async()=>{
    const response=await request.get(readinessUrl,{headers:{...planner,'X-Plant-ID':plantId}});
    expect(response.status(),await response.text()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    const data=(await response.json()).data;
    expect(data.assetId).toBe(assetId);
    expect(data.totalChecks).toBe(10);
    expect(data.physicalAcceptanceComplete).toBe(false);
    expect(data.softwarePreflightComplete).toBe(false);
    expect(data.configuredCount).toBe(data.checks.filter((row:{state:string})=>row.state==='configured').length);
    return Object.fromEntries(data.checks.map((row:{key:string;state:string})=>[row.key,row.state]));
  };
  expect((await request.get(readinessUrl)).status()).toBe(401);
  expect((await request.get(readinessUrl,{headers:otherPlant})).status()).toBe(403);
  const initialReadiness=await readiness();
  // A secondary hierarchy must never be counted as a primary installed path.
  // This test has no licensed CAD or genuine photos, even with a complete identity.
  expect(initialReadiness).toMatchObject({identity:'configured',location:'missing',hierarchy:'missing',
    meters:'configured',photos:'missing',cad:'missing',pm:'missing',shifts:'missing',production:'missing'});
  const locations=await request.get('/api/assets/'+assetId+'/functional-locations',{headers:admin});
  expect(locations.status()).toBe(200);
  expect((await locations.json()).data.current.some((a:{functionalLocationId:string})=>a.functionalLocationId===functionalLocationId)).toBe(true);
  const meterUrl='/api/assets/'+assetId+'/meters';
  const getMeters=async()=>{
    const result=await request.get(meterUrl,{headers:admin});
    expect(result.status()).toBe(200);
    return (await result.json()).data as Array<{id:string;name:string;currentValue:number}>;
  };
  const initial=await getMeters();
  const output=initial.find(m=>m.name===outputName),runtime=initial.find(m=>m.name===runtimeName);
  expect(output?.currentValue).toBe(0);
  expect(runtime?.currentValue).toBe(0);
  const part=await request.post('/api/component-registry',{headers:admin,data:{
    assetId,name:'Synthetic drive-end bearing',componentCode:'DEMO-BRG-'+suffix,componentType:'part',
    inspectionParameters:[{name:'Vibration',inspectionType:'measurement',unit:'mm/s',min:0,max:4.5,reference:'Synthetic test fixture only'}],
  }});
  expect(part.status(),await part.text()).toBe(201);
  const componentId=(await part.json()).data.id;
  const crewResponse=await request.get('/api/production-surveys/crew?plantId='+plantId,{headers:manager});
  expect(crewResponse.status()).toBe(200);
  const operatorId=(await crewResponse.json()).data.find((u:{username:string})=>u.username==='operator1')?.id;
  expect(operatorId).toBeTruthy();
  const productCode='DEMO-'+suffix;
  const product=await request.post('/api/production-surveys/products',{headers:manager,data:{
    assetId,code:productCode,name:'Synthetic fabric',unit:'yards',
  }});
  expect(product.status()).toBe(200);
  const shift=await request.post('/api/production-surveys/setup',{headers:manager,data:{
    plantId,name:'Demo Morning '+suffix,code:'demo_'+suffix,startsAt:'06:00',endsAt:'14:00',
  }});
  expect(shift.status(),await shift.text()).toBe(201);
  const shiftTemplateId=(await shift.json()).data.id;
  // Use a separate historical date from the other operator scenario (and each retry).
  const productionDate=new Date(Date.now()-(3+testInfo.retry)*86400000).toISOString().slice(0,10);
  const plan={assetId,shiftTemplateId,productionDate,plannedShiftsPerDay:1,shiftHours:8,
    availableMinutes:480,plannedBreakMinutes:30,startsAt:'06:00',endsAt:'14:00',
    targetQuantity:6000,unit:'yards',productCode,crewUserIds:[operatorId],leaderUserId:operatorId,
    standardUtilizationPct:85,standardSpeed:15};
  const published=await request.post('/api/production-surveys/plans',{headers:manager,data:plan});
  expect(published.status(),await published.text()).toBe(200);
  const futurePlan={...plan,productionDate:new Date(Date.now()+86400000).toISOString().slice(0,10)};
  const futurePublished=await request.post('/api/production-surveys/plans',{headers:manager,data:futurePlan});
  expect(futurePublished.status(),await futurePublished.text()).toBe(200);
  const pmTask=await request.post('/api/pm-tasks',{headers:{...planner,'X-Plant-ID':plantId},data:{
    description:'Synthetic bearing lubrication '+suffix,taskType:'lubrication',
  }});
  expect(pmTask.status(),await pmTask.text()).toBe(201);
  const pmTaskId=(await pmTask.json()).data.id;
  const schedule=await request.post('/api/pm-schedules',{headers:{...planner,'X-Plant-ID':plantId},data:{
    title:'Demo bearing maintenance '+suffix,assetId,componentId,priority:'high',autoGenerateWO:true,
    scheduledTasks:[{pmTaskId,sortOrder:0,maintenanceMode:'ubm',equipmentState:'stopped',
      estimatedMinutes:25,leadDays:0,frequencyInterval:5000,frequencyUnit:'yards',meterName:outputName,
      assetMeterId:output!.id,recurrenceBasis:'after_completion'}],
  }});
  expect(schedule.status(),await schedule.text()).toBe(201);
  const scheduleId=(await schedule.json()).data.id as string;
  expect(scheduleId).toBeTruthy();
  const getThreshold=async()=>{
    const result=await request.get('/api/production-surveys/pm-progress?assetId='+assetId,{headers:manager});
    expect(result.status(),await result.text()).toBe(200);
    return (await result.json()).data.thresholds.find((t:{meterName:string})=>t.meterName===outputName);
  };
  expect(await getThreshold()).toMatchObject({state:'upcoming',currentValue:0,nextDueReading:5000});
  expect(await readiness()).toMatchObject({parameters:'configured',meters:'configured',
    pm:'configured',shifts:'configured',production:'missing',photos:'missing',cad:'missing'});
  const evaluate=async()=>{
    const response=await request.post('/api/pm-schedules/check-due',{headers:{...planner,'X-Plant-ID':plantId},data:{}});
    expect(response.status(),await response.text()).toBe(200);
    return ((await response.json()).data.engines.scheduledTasks.results as Array<{scheduleId:string;skipped:boolean;workOrderId:string;scheduledTaskIds:string[]}>).filter(row=>row.scheduleId===scheduleId&&!row.skipped);
  };
  expect(await evaluate()).toHaveLength(0);
  const entry=await request.post('/api/production-surveys',{headers:operator,data:{
    ...plan,assetMeterId:output!.id,runtimeMeterId:runtime!.id,runtimeCounterHours:6.5,
    runtimeEvidence:'Synthetic hour-counter evidence',outputQuantity:5500,defectiveQuantity:100,startDelayMinutes:5,
    breakMinutes:30,repairMinutes:20,inputDeliveryMinutes:10,changeoverMinutes:15,startupCleaningMinutes:10,
    otherMinutes:5,preventiveMinutes:0,
  }});
  expect(entry.status(),await entry.text()).toBe(201);
  const record=(await entry.json()).data;
  expect((await getMeters()).find(m=>m.id===output!.id)?.currentValue).toBe(0);
  expect(await getThreshold()).toMatchObject({state:'upcoming',currentValue:0,nextDueReading:5000});
  const review='/api/production-surveys/'+record.id+'/review';
  expect((await request.post(review,{headers:operator,data:{action:'approve'}})).status()).toBe(403);
  const approval=await request.post(review,{headers:manager,data:{action:'approve'}});
  expect(approval.status(),await approval.text()).toBe(200);
  expect((await approval.json()).data).toMatchObject({meterPosted:true,runtimeMeterPosted:true});
  expect(await readiness()).toMatchObject({production:'configured',photos:'missing',cad:'missing'});
  const replay=await request.post(review,{headers:manager,data:{action:'approve'}});
  expect(replay.status()).toBe(200);
  expect((await replay.json()).data.duplicate).toBe(true);
  const meters=await getMeters();
  expect(meters.find(m=>m.id===output!.id)?.currentValue).toBe(5500);
  expect(meters.find(m=>m.id===runtime!.id)?.currentValue).toBe(6.5);
  expect(await getThreshold()).toMatchObject({state:'due',currentValue:5500,nextDueReading:5000,remaining:0});
  // The same approved meter observation drives a real task-level PM work order.
  // Neither generation nor technician/supervisor sign-off may advance the cycle.
  const generated=await evaluate();
  expect(generated).toHaveLength(1);
  const woId=generated[0].workOrderId;
  expect(woId).toBeTruthy();
  expect(generated[0].scheduledTaskIds).toHaveLength(1);
  const token=(headers:{Authorization:string})=>headers.Authorization.replace('Bearer ','');
  const plannerToken=token(planner),technicianToken=token(technician),supervisorToken=token(supervisor);
  const userId=async(headers:{Authorization:string})=>{
    const response=await request.get('/api/auth/me',{headers});
    expect(response.status(),await response.text()).toBe(200);
    const user=(await response.json()).data.user;
    expect(user.plantAccess.some((plant:{id:string})=>plant.id===plantId)).toBe(true);
    return user.id as string;
  };
  const [technicianId,supervisorId]=await Promise.all([userId(technician),userId(supervisor)]);
  // Use the same administrator API available during actual commissioning.
  const rateEndpoint='/api/users/'+technicianId+'/labor-rates';
  const rate=await request.post(rateEndpoint,{headers:{...admin,'X-Plant-ID':plantId},data:{
    plantId,normalHourlyRate:50,overtimeHourlyRate:75,
  }});
  expect([200,201],await rate.text()).toContain(rate.status());
  const workOrder=await getWO(plannerToken,woId);
  expect(workOrder.type).toBe('preventive');
  expect(workOrder.pmSchedule?.id??workOrder.pmScheduleId).toBe(scheduleId);
  expect(workOrder.workOrderComponents?.some((link:{componentRegistry?:{id:string}})=>link.componentRegistry?.id===componentId)).toBe(true);
  expect(await evaluate()).toHaveLength(0);
  expect(await getThreshold()).toMatchObject({currentValue:5500,nextDueReading:5000});
  await assignWO(plannerToken,woId,{assignedTo:technicianId,assignedSupervisorId:supervisorId,
    teamLeaderId:technicianId,teamMembers:[{userId:technicianId,role:'team_leader'}]});
  await startWO(technicianToken,woId);
  const tasks=await request.get('/api/work-orders/'+woId+'/tasks',{headers:technician});
  expect(tasks.status(),await tasks.text()).toBe(200);
  const checklist=(await tasks.json()).data;
  expect(checklist).toHaveLength(1);
  expect(checklist[0].pmScheduleTaskId).toBe(generated[0].scheduledTaskIds[0]);
  const done=await request.patch('/api/work-orders/'+woId+'/tasks/'+checklist[0].id,{headers:technician,data:{status:'completed'}});
  expect(done.status(),await done.text()).toBe(200);
  const stop=await request.post('/api/work-orders/'+woId+'/time-logs/stop',{headers:technician,data:{}});
  expect(stop.status(),await stop.text()).toBe(200);
  await logTime(technicianToken,woId,{action:'start',manualHours:0.5,notes:'Synthetic bearing PM execution'});
  await completeWO(technicianToken,woId,'Synthetic bearing lubrication completed');
  expect((await getWO(plannerToken,woId)).status).toBe('completed');
  expect(await getThreshold()).toMatchObject({nextDueReading:5000});
  await verifyWO(supervisorToken,woId,5);
  expect((await getWO(plannerToken,woId)).status).toBe('verified');
  expect(await getThreshold()).toMatchObject({nextDueReading:5000});
  await closeWO(plannerToken,woId);
  const closed=await getWO(plannerToken,woId);
  expect(closed.status).toBe('closed');
  expect(Number(closed.actualHours)).toBeGreaterThanOrEqual(0.5);
  expect(Number(closed.laborCost)).toBeCloseTo(Number(closed.actualHours)*50,2);
  expect(Number(closed.totalCost)).toBeGreaterThanOrEqual(25);
  expect(closed.laborCurrency).toBe('GHS');
  expect(await readiness()).toMatchObject({identity:'configured',location:'missing',parameters:'configured',meters:'configured',pm:'configured',shifts:'configured',production:'configured',photos:'missing',cad:'missing'});
  expect(await getThreshold()).toMatchObject({state:'upcoming',currentValue:5500,nextDueReading:10500,remaining:5000});
  expect(await evaluate()).toHaveLength(0);
  expect((await getMeters()).find(m=>m.id===output!.id)?.currentValue).toBe(5500);
  for(const group of ['day','week','month','quarter','year']){
    const report=await request.get('/api/production-surveys/report?assetId='+assetId+'&group='+group+
      '&from='+productionDate+'&to='+productionDate,{headers:manager});
    expect(report.status(),await report.text()).toBe(200);
    const rows=(await report.json()).data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({output:5500,goodOutput:5400,defects:100,target:6000,
      productiveMinutes:390,downtimeMinutes:90,availableMinutes:480,utilizationPct:81.25,
      workbookCumulativeProduction:5500,meterLinkedOutput:5500,plannedShifts:1,unapprovedOrMissingShifts:0});
    expect(rows[0].targetAchievementPct).toBeCloseTo(91.6667,3);
    expect(rows[0].engineeringEfficiencyPct).toBeCloseTo(95.8333,3);
  }
  // Exercise the actual manager report UI and downloaded workbook-compatible
  // CSV, not just the JSON report endpoint.
  await context.addInitScript(({token,plantId})=>{
    localStorage.setItem('eam_token',token);
    localStorage.setItem('user_plant_id',plantId);
  },{token:token(manager),plantId});
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/production-survey');
  const survey=page.getByTestId('production-shift-survey');
  await expect(survey.getByRole('heading',{name:'Production Survey & PM Usage',exact:true})).toBeVisible({timeout:30_000});
  await survey.getByRole('combobox',{name:'Find machine by name or code'}).click();
  await page.getByPlaceholder('Search...', {exact:true}).fill('DEMO-ST-'+suffix);
  await page.getByRole('option',{name:'Synthetic demo stenter '+suffix+' [DEMO-ST-'+suffix+']',exact:true}).click();
  const reportCard=survey.locator('[data-slot="card"]').filter({has:survey.getByText('Production performance reports',{exact:true})});
  const dates=reportCard.locator('input[type=date]');
  await expect(dates).toHaveCount(2);
  const table=reportCard.getByRole('table');
  const exportForDate=async(date:string)=>{
    await dates.nth(0).fill(date);
    const response=page.waitForResponse(r=>{
      const u=new URL(r.url());
      return u.pathname==='/api/production-surveys/report'&&u.searchParams.get('assetId')===assetId&&
        u.searchParams.get('from')===date&&u.searchParams.get('to')===date&&u.searchParams.get('group')==='day';
    });
    await dates.nth(1).fill(date);
    // An unchanged date input may not fire onChange; refresh explicitly.
    await survey.getByRole('button',{name:'Refresh',exact:true}).click();
    expect((await response).status()).toBe(200);
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.getByText('DEMO-ST-'+suffix,{exact:true})).toBeVisible();
    const downloadPromise=page.waitForEvent('download');
    await reportCard.getByRole('button',{name:'Export CSV',exact:true}).click();
    const download=await downloadPromise;
    expect(download.suggestedFilename()).toBe('production-survey-day-'+date+'-'+date+'.csv');
    const csv=(await readFile((await download.path())!,'utf8')).replace(/^\uFEFF/,'');
    const lines=csv.trimEnd().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    const cells=(line:string)=>[...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m=>m[1].replace(/""/g,'"'));
    const headers=cells(lines[0]),values=cells(lines[1]);
    expect(headers).toHaveLength(30);expect(values).toHaveLength(30);
    await testInfo.attach('production-workbook-'+date,{body:csv,contentType:'text/csv'});
    return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));
  };
  const actual=await exportForDate(productionDate);
  expect(actual).toMatchObject({'Machine Code':'DEMO-ST-'+suffix,'Unit':'yards',
    'Gross Production':'5500','Defective Production':'100','Good Production':'5400',
    'Target':'6000','Available Min':'480','Stoppage Min':'90','Productive Min':'390',
    'Period Cumulative Production':'5500','PM Meter Output':'5500'});
  const pending=await exportForDate(futurePlan.productionDate);
  expect(pending).toMatchObject({'Scheduled Shifts':'1','Unapproved/Missing Shifts':'1',
    'Gross Production':'','Defective Production':'','Good Production':'',
    'Target Achievement %':'','Period Cumulative Production':''});
});
