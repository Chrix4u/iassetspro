import { test, expect, type APIRequestContext } from '@playwright/test';

const creds = {
  admin: ['admin', 'admin123'],
  manager: ['prod_mgr1', 'password123'],
  operator: ['operator1', 'password123'],
  operatorOtherPlant: ['op2', 'password123'],
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
