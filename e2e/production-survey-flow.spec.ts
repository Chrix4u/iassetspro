import { test, expect, type APIRequestContext } from '@playwright/test';

const creds = {
  admin: ['admin', 'admin123'],
  manager: ['prod_mgr1', 'password123'],
  operator: ['operator1', 'password123'],
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
  const [admin,manager,operator]=await Promise.all([
    actor(request,'admin'),actor(request,'manager'),actor(request,'operator')]);
  const assetsResponse=await request.get('/api/assets?limit=50',{headers:operator});
  expect(assetsResponse.status()).toBe(200);
  const assets=(await assetsResponse.json()).data as Array<{id:string;plantId:string}>;
  const asset=assets.find(a=>a.id&&a.plantId);
  expect(asset).toBeTruthy();
  const assetId=asset!.id,plantId=asset!.plantId;
  const suffix=String(Date.now()),runtimeName='CI Runtime '+suffix,outputName='CI Output '+suffix;
  const createMeter=async(name:string,meterType:string,unit:string,initialValue:number)=>{
    const response=await request.post('/api/assets/'+assetId+'/meters',{
      headers:admin,data:{name,meterType,unit,initialValue}});
    expect(response.status()).toBe(201);
    return (await response.json()).data as {id:string};
  };
  const runtime=await createMeter(runtimeName,'runtime','hours',120);
  const output=await createMeter(outputName,'production','yards',0);
  const shiftResponse=await request.post('/api/production-surveys/setup',{
    headers:manager,data:{plantId,name:'CI Survey '+suffix,code:'ci_'+suffix}});
  expect(shiftResponse.status()).toBe(201);
  const shiftTemplateId=(await shiftResponse.json()).data.id as string;
  const productionDate=new Date().toISOString().slice(0,10);
  const plan={
    assetId,shiftTemplateId,productionDate,plannedShiftsPerDay:1,
    shiftHours:8,availableMinutes:480,targetQuantity:1500,unit:'yards',
    standardUtilizationPct:85,standardSpeed:4,
  };
  expect((await request.post('/api/production-surveys/plans',{
    headers:operator,data:plan})).status()).toBe(403);
  expect((await request.post('/api/production-surveys/plans',{
    headers:manager,data:plan})).status()).toBe(200);
  const setup=await request.get('/api/production-surveys/setup?assetId='+assetId,{headers:operator});
  expect(setup.status()).toBe(200);
  const setupBody=(await setup.json()).data;
  expect(setupBody.runtimeMeters.some((m:{id:string})=>m.id===runtime.id)).toBe(true);
  expect(setupBody.meters.some((m:{id:string})=>m.id===output.id)).toBe(true);
  const pmSchedule=await request.post('/api/pm-schedules',{
    headers:admin,data:{
      title:'CI Runtime Maintenance '+suffix,assetId,frequencyType:'meter',
      frequencyValue:5,frequencyUnit:'hours',meterName:runtimeName,
      estimatedDuration:1,autoGenerateWO:false,leadDays:0,
    }});
  expect(pmSchedule.status()).toBe(201);
  const entry=await request.post('/api/production-surveys',{headers:operator,data:{
    ...plan,assetMeterId:output.id,runtimeMeterId:runtime.id,
    runtimeCounterHours:125.5,runtimeEvidence:'Physical panel hour-meter display',
    outputQuantity:1200,targetQuantity:99999,availableMinutes:999,
    breakMinutes:30,repairMinutes:45,inputDeliveryMinutes:10,
    changeoverMinutes:5,startupCleaningMinutes:15,
    otherMinutes:0,preventiveMinutes:0,notes:'Isolated UAT data',
  }});
  expect(entry.status()).toBe(201);
  const record=(await entry.json()).data;
  expect(record.targetQuantity).toBe(1500);
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
  const daily=(await report.json()).data as Array<{output:number;target:number;productiveMinutes:number}>;
  expect(daily.some(r=>r.output>=1200&&r.target>=1500&&r.productiveMinutes>=375)).toBe(true);
});
