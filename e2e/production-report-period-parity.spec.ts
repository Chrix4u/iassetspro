import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function login(request: APIRequestContext, username: string, password: string) {
  const response = await request.post('/api/auth/login', { data: { username, password } });
  expect(response.status()).toBe(200);
  return { Authorization: 'Bearer ' + String((await response.json()).data.token) };
}

/** All records are synthetic and isolated. Expected values are independent
 * hand-calculated workbook formula examples, not calls to the implementation. */
test('production workbook formulas reconcile approved shifts, all periods, overnight dates and separate units', async ({ request }) => {
  const isolated = process.env.CI === 'true' &&
    process.env.DATABASE_URL?.includes('/platform_e2e?schema=public') &&
    process.env.PLAYWRIGHT_BASE_URL === 'http://127.0.0.1:3000';
  if (process.env.CI === 'true' && !isolated) throw new Error('Requires isolated platform CI');
  test.skip(!isolated, 'Only isolated platform CI may create synthetic survey data');
  test.setTimeout(150_000);
  const [admin, manager, operator] = await Promise.all([
    login(request, 'admin', 'admin123'), login(request, 'prod_mgr1', 'password123'),
    login(request, 'operator1', 'password123'),
  ]);
  const get = async (path: string, headers = manager) => {
    const r = await request.get(path, { headers });
    expect(r.status(), await r.text()).toBe(200);
    return (await r.json()).data;
  };
  const post = async (path: string, data: Record<string, unknown>, headers = manager, status = 200) => {
    const r = await request.post(path, { headers, data });
    expect(r.status(), await r.text()).toBe(status);
    return (await r.json()).data;
  };
  const plants = await get('/api/assets?limit=50', operator);
  const plantId = plants.find((a: {plantId?: string}) => a.plantId)?.plantId;
  const categories = await get('/api/asset-categories', admin);
  expect(plantId).toBeTruthy();
  expect(categories[0]?.id).toBeTruthy();
  const stamp = randomUUID().slice(0, 10);
  const asset = await post('/api/assets', {
    name: 'Synthetic period parity ' + stamp, assetTag: 'CI-PERIOD-' + stamp,
    categoryId: categories[0].id, plantId, status: 'operational',
  }, admin, 201);
  const assetId = asset.id;
  const crew = await get('/api/production-surveys/crew?plantId=' + plantId);
  const operatorId = crew.find((u: {username:string}) => u.username === 'operator1')?.id;
  expect(operatorId).toBeTruthy();
  const yardsCode = 'Y-' + stamp.toUpperCase(), piecesCode = 'P-' + stamp.toUpperCase();
  for (const [code, unit] of [[yardsCode, 'yards'], [piecesCode, 'pieces']]) {
    await post('/api/production-surveys/products', { assetId, code, unit, name: 'Synthetic ' + unit });
  }
  const shift = await post('/api/production-surveys/setup', {
    plantId, name: 'CI overnight parity ' + stamp, code: 'ci_period_' + stamp,
    startsAt: '22:00', endsAt: '06:00',
  }, manager, 201);
  const dates = ['2024-12-27', '2024-12-28', '2024-12-29', '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'];
  const plan = {
    assetId, shiftTemplateId: shift.id, plannedShiftsPerDay: 1,
    shiftHours: 8, startsAt: '22:00', endsAt: '06:00', availableMinutes: 480,
    plannedBreakMinutes: 0, targetQuantity: 1500, unit: 'yards', productCode: yardsCode,
    crewUserIds: [operatorId], leaderUserId: operatorId,
    standardUtilizationPct: 85, standardSpeed: 4,
  };
  const plans = dates.map((productionDate, i) => ({
    ...plan, productionDate,
    ...(i === 2 ? {standardUtilizationPct: 90, standardSpeed: 5} : {}),
    ...(i === 3 ? {standardUtilizationPct: 95, standardSpeed: 6} : {}),
    ...(i === 5 ? {unit: 'pieces', productCode: piecesCode, availableMinutes: 0, targetQuantity: 100} : {}),
  }));
  for (const p of plans) await post('/api/production-surveys/plans', p);
  const blank = { breakMinutes:0, repairMinutes:0, inputDeliveryMinutes:0,
    changeoverMinutes:0, startupCleaningMinutes:0, otherMinutes:0, preventiveMinutes:0,
    startDelayMinutes:0, defectiveQuantity:0 };
  const fixtures = [
    {outputQuantity:100},
    {outputQuantity:1200,defectiveQuantity:75,startDelayMinutes:10,breakMinutes:30,repairMinutes:45,inputDeliveryMinutes:10,changeoverMinutes:5,startupCleaningMinutes:15},
    {outputQuantity:800,defectiveQuantity:20,startDelayMinutes:5,breakMinutes:30,repairMinutes:20,inputDeliveryMinutes:10,changeoverMinutes:5,startupCleaningMinutes:5,otherMinutes:5,preventiveMinutes:5},
    {outputQuantity:600,defectiveQuantity:0,startDelayMinutes:7,breakMinutes:30,repairMinutes:60,inputDeliveryMinutes:10,changeoverMinutes:5,startupCleaningMinutes:5,otherMinutes:5,preventiveMinutes:5},
    {outputQuantity:9999},
    {outputQuantity:0},
  ];
  for (let i=0;i<fixtures.length;i++) {
    const entry=await post('/api/production-surveys',{...plans[i],...blank,...fixtures[i]},operator,201);
    expect(new Date(entry.productionDate).toISOString().slice(0,10)).toBe(dates[i]);
    if(i!==4) await post('/api/production-surveys/'+entry.id+'/review',{action:'approve'});
  }
  const report=async(group:string,from='2024-12-28',to='2025-01-04')=>
    get('/api/production-surveys/report?assetId='+encodeURIComponent(assetId)+'&group='+group+'&from='+from+'&to='+to);
  const day=await report('day');
  const a=day.find((r:{period:string;unit:string})=>r.period==='2024-12-28'&&r.unit==='yards');
  expect(a).toMatchObject({shifts:1,output:1200,defects:75,goodOutput:1125,target:1500,
    availableMinutes:480,downtimeMinutes:105,productiveMinutes:375,repairMinutes:45,startDelayMinutes:10,
    workbookCumulativeProduction:1200,cumulativeProduction:1300,plannedShifts:1,unapprovedOrMissingShifts:0,
    standardUtilizationPct:85,standardSpeedPerMinute:4,approvedOutputReported:true});
  expect(a.utilizationPct).toBeCloseTo(78.125);
  expect(a.speedPerMinute).toBeCloseTo(3.2);
  expect(a.productivityPerMinute).toBeCloseTo(2.5);
  expect(a.engineeringEfficiencyPct).toBeCloseTo(90.625);
  expect(a.defectRatePct).toBeCloseTo(6.25);
  expect(a.targetAchievementPct).toBeCloseTo(80);
  const missing=day.filter((r:{unit:string;approvedOutputReported:boolean})=>r.unit==='yards'&&!r.approvedOutputReported);
  expect(missing.map((r:{period:string})=>r.period)).toEqual(['2025-01-02','2025-01-04']);
  for(const r of missing) expect(r).toMatchObject({shifts:0,plannedShifts:1,unapprovedOrMissingShifts:1,
    target:1500,targetAchievementPct:null,utilizationPct:null,speedPerMinute:null,approvedOutputReported:false});
  const zero=day.find((r:{unit:string})=>r.unit==='pieces');
  expect(zero).toMatchObject({output:0,approvedOutputReported:true,shifts:1,plannedShifts:1,target:100,
    targetAchievementPct:0,utilizationPct:null,speedPerMinute:null,productivityPerMinute:null,engineeringEfficiencyPct:null});
  const week=(await report('week')).filter((r:{unit:string})=>r.unit==='yards');
  expect(week.map((r:{period:string;output:number;target:number;cumulativeProduction:number;unapprovedOrMissingShifts:number})=>
    [r.period,r.output,r.target,r.cumulativeProduction,r.unapprovedOrMissingShifts])).toEqual([
    ['2024-12-22',1200,1500,1300,0],['2024-12-29',1400,6000,2700,2],
  ]);
  for (const [group,periods] of [['month',['2024-12','2025-01']],['quarter',['2024-Q4','2025-Q1']],['year',['2024','2025']]] as const){
    const rows=(await report(group)).filter((r:{unit:string})=>r.unit==='yards');
    expect(rows.map((r:{period:string;output:number;target:number;cumulativeProduction:number;unapprovedOrMissingShifts:number})=>
      [r.period,r.output,r.target,r.cumulativeProduction,r.unapprovedOrMissingShifts])).toEqual([
      [periods[0],2000,3000,2100,0],[periods[1],600,4500,2700,2],
    ]);
    expect(rows[0].productiveMinutes).toBe(775);
    expect(rows[0].standardUtilizationPct).toBeCloseTo(87.5);
    expect(rows[0].standardSpeedPerMinute).toBeCloseTo((4*375+5*400)/775);
    expect(rows[0].speedPerMinute).toBeCloseTo(2000/775);
  }
  const exact=(await report('day','2025-01-01','2025-01-01'))[0];
  expect(exact).toMatchObject({output:600,workbookCumulativeProduction:600,cumulativeProduction:2700,productiveMinutes:360});
  expect(exact.engineeringEfficiencyPct).toBeCloseTo(87.5);
  expect((await request.get('/api/production-surveys/report?assetId='+assetId+'&group=week&from=2025-02-30&to=2025-03-01',{headers:manager})).status()).toBe(400);
});
