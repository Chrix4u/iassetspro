import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({records:vi.fn(),plans:vi.fn(),earlier:vi.fn()}));
vi.mock('@/lib/db',()=>({db:{productionShiftRecord:{findMany:mocks.records,groupBy:mocks.earlier},productionShiftPlan:{findMany:mocks.plans}}}));
vi.mock('@/lib/auth',()=>({getSession:()=>({userId:'reviewer',roles:['admin']}),isAdmin:()=>true,hasPermission:()=>true}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:async()=>({denyAccess:false}),getPlantFilterWhere:()=>({plantId:'demo-plant'})}));
vi.mock('@/lib/production-shift-access',()=>({requiresCrewScope:()=>false}));
import {GET} from '@/app/api/production-surveys/report/route';
const productionDate=new Date('2026-11-24T00:00:00Z');
const asset={id:'demo-stenter',name:'Demo Stenter',assetTag:'DEMO-ST01'};
const plan={id:'demo-plan',assetId:asset.id,asset,unit:'yards',productionDate,targetQuantity:6000};
const record={...plan,planId:plan.id,shift:{name:'Morning',code:'M'},productCode:'DEMO-DC001',
  outputQuantity:5500,defectiveQuantity:100,startDelayMinutes:5,availableMinutes:480,
  breakMinutes:30,repairMinutes:20,inputDeliveryMinutes:10,changeoverMinutes:15,
  startupCleaningMinutes:10,otherMinutes:5,preventiveMinutes:0,standardUtilizationPct:85,
  standardSpeed:15,meterReadingId:'demo-reading'};
describe('board demonstration exact production report arithmetic',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mocks.records.mockResolvedValue([record]);
    mocks.plans.mockResolvedValue([plan]);
    mocks.earlier.mockResolvedValue([]);
  });
  it.each([['day','2026-11-24'],['week','2026-11-22'],['month','2026-11'],['quarter','2026-Q4'],['year','2026']])('matches the approved demonstration report for %s',async(group,period)=>{
    const response=await GET(new NextRequest('http://localhost/api/production-surveys/report?assetId=demo-stenter&from=2026-11-24&to=2026-11-24&group='+group));
    expect(response.status).toBe(200);
    const result=await response.json();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    const row=result.data[0];
    expect(row).toMatchObject({period,output:5500,goodOutput:5400,defects:100,target:6000,
      availableMinutes:480,downtimeMinutes:90,productiveMinutes:390,startDelayMinutes:5,
      utilizationPct:81.25,standardUtilizationPct:85,standardSpeedPerMinute:15,
      cumulativeProduction:5500,workbookCumulativeProduction:5500,meterLinkedOutput:5500,
      shifts:1,plannedShifts:1,unapprovedOrMissingShifts:0,approvedOutputReported:true});
    expect(row.defectRatePct).toBeCloseTo(1.81818,4);
    expect(row.targetAchievementPct).toBeCloseTo(91.66667,4);
    expect(row.speedPerMinute).toBeCloseTo(14.10256,4);
    expect(row.productivityPerMinute).toBeCloseTo(11.45833,4);
    expect(row.engineeringEfficiencyPct).toBeCloseTo(95.83333,4);
    expect(mocks.records).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({status:'approved',plantId:'demo-plant',assetId:asset.id})}));
  });
  it('keeps an unreported scheduled shift distinct from an observed zero',async()=>{
    mocks.records.mockResolvedValue([]);
    const response=await GET(new NextRequest('http://localhost/api/production-surveys/report?assetId=demo-stenter&from=2026-11-24&to=2026-11-24'));
    expect(response.status).toBe(200);
    const result=await response.json();
    expect(result.data[0]).toMatchObject({target:6000,approvedOutputReported:false,shifts:0,unapprovedOrMissingShifts:1,meterLinkedOutput:0,targetAchievementPct:null});
  });
});
