import { NextRequest,NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { getPlantScope,getPlantFilterWhere } from '@/lib/plant-scope';
import { requiresCrewScope } from '@/lib/production-shift-access';
import { reportingWeekStart,surveyTotals } from '@/lib/production-shift-survey';

const groups=['day','week','month','quarter','year'] as const;
type Group=(typeof groups)[number];
function periodKey(date:Date, group:Group):string {
  const day=date.toISOString().slice(0,10);
  if(group==='week')return reportingWeekStart(date);
  if(group==='month')return day.slice(0,7);
  if(group==='quarter')return day.slice(0,4)+'-Q'+String(Math.floor(date.getUTCMonth()/3)+1);
  if(group==='year')return day.slice(0,4);
  return day;
}

// Daily and Sunday-to-Saturday weekly summaries. Pending/unapproved output is excluded from PM and KPI totals.
export async function GET(request:NextRequest) {
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session)&&!hasPermission(session,'production_surveys.view'))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
  try{
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const q=new URL(request.url).searchParams;
    const rawGroup=q.get('group')||'day';
    if(!groups.includes(rawGroup as Group))return NextResponse.json({success:false,error:'Invalid report period'},{status:400});
    const group=rawGroup as Group;
    const today=new Date().toISOString().slice(0,10);
    const from=q.get('from')||new Date(Date.now()-6*86400000).toISOString().slice(0,10);
    const to=q.get('to')||today;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
      return NextResponse.json({success:false,error:'Dates must be yyyy-mm-dd'},{status:400});
    const first=new Date(from+'T00:00:00Z'),last=new Date(to+'T00:00:00Z');
    if(Number.isNaN(first.getTime())||Number.isNaN(last.getTime())||
      first.toISOString().slice(0,10)!==from||last.toISOString().slice(0,10)!==to||
      first>last||last.getTime()-first.getTime()>366*86400000)
      return NextResponse.json({success:false,error:'Report window must be 0–366 days'},{status:400});
    const assetId=q.get('assetId')||undefined;
    const crewFilter:Prisma.ProductionShiftRecordWhereInput=requiresCrewScope(session)
      ?{OR:[{plan:{crew:{some:{userId:session.userId}}}},{recordedById:session.userId}]}:{};
    const where:Prisma.ProductionShiftRecordWhereInput={...getPlantFilterWhere(scope),...crewFilter,status:'approved',
      productionDate:{gte:first,lte:last},...(assetId?{assetId}:{})};
    const records=await db.productionShiftRecord.findMany({where,include:{
      asset:{select:{name:true,assetTag:true,id:true}},shift:{select:{name:true,code:true}},
    },orderBy:[{productionDate:'asc'},{createdAt:'asc'}],take:20001});
    // Never return apparently authoritative production totals from a partial read.
    // Fetch one extra row to detect when a plant/date selection exceeds this bound.
    if(records.length>20000)return NextResponse.json({success:false,
      error:'More than 20,000 approved shifts match the report. Narrow the date range or select a machine; no partial totals were returned.',
      meta:{limit:20000,truncated:true}}, {status:422});
    // Targets are planner commitments, not merely targets on shifts that
    // happened to be approved. Do not erase missing/late shifts from the plan.
    const scheduled=await db.productionShiftPlan.findMany({
      where:{...getPlantFilterWhere(scope),productionDate:{gte:first,lte:last},
        ...(assetId?{assetId}:{}),
        ...(requiresCrewScope(session)?{OR:[
          {crew:{some:{userId:session.userId}}},
          {records:{some:{recordedById:session.userId}}},
        ]}:{}),},
      select:{id:true,assetId:true,unit:true,productionDate:true,targetQuantity:true,
        asset:{select:{name:true,assetTag:true}}},
      orderBy:[{productionDate:'asc'},{assetId:'asc'}],take:20001,
    });
    if(scheduled.length>20000)return NextResponse.json({success:false,
      error:'More than 20,000 scheduled shifts match the report. Narrow your selection to prevent partial target totals.',
      meta:{limit:20000,truncated:true}}, {status:422});
    const plannedByPeriod=new Map<string,{target:number;shifts:number}>();
    for(const plan of scheduled){
      const key=[periodKey(plan.productionDate,group),plan.assetId,plan.unit].join('|');
      const row=plannedByPeriod.get(key)||{target:0,shifts:0};
      row.target+=plan.targetQuantity;row.shifts++;
      plannedByPeriod.set(key,row);
    }
    const grouped=new Map<string,{period:string;assetId:string;machine:string;assetTag:string;unit:string;
      shifts:number;output:number;defects:number;startDelayMinutes:number;target:number;availableMinutes:number;downtimeMinutes:number;productiveMinutes:number;
      repairMinutes:number;preventiveMinutes:number;breakMinutes:number;meterLinkedOutput:number;
      weightedStandardUtilization:number;standardUtilizationWeight:number;
      weightedStandardSpeed:number;standardSpeedWeight:number;shiftNames:Set<string>;productCodes:Set<string>}>();
    // Planned-only groups must appear with their targets and missing-shift count,
    // even if no shift has been approved. Do not represent absent readings as
    // observed zero production.
    for(const plan of scheduled){
      const period=periodKey(plan.productionDate,group);
      const key=[period,plan.assetId,plan.unit].join('|');
      if(!grouped.has(key))grouped.set(key,{
        period,assetId:plan.assetId,machine:plan.asset.name,assetTag:plan.asset.assetTag,unit:plan.unit,
        shifts:0,output:0,defects:0,startDelayMinutes:0,target:0,availableMinutes:0,
        downtimeMinutes:0,productiveMinutes:0,repairMinutes:0,preventiveMinutes:0,
        breakMinutes:0,meterLinkedOutput:0,weightedStandardUtilization:0,
        standardUtilizationWeight:0,weightedStandardSpeed:0,standardSpeedWeight:0,
        shiftNames:new Set<string>(),productCodes:new Set<string>(),
      });
    }
    for(const row of records){
      const period=periodKey(row.productionDate,group);
      const key=[period,row.assetId,row.unit].join('|');
      let item=grouped.get(key);
      if(!item){item={period,assetId:row.assetId,machine:row.asset.name,assetTag:row.asset.assetTag,unit:row.unit,
        shifts:0,output:0,defects:0,startDelayMinutes:0,target:0,availableMinutes:0,downtimeMinutes:0,productiveMinutes:0,repairMinutes:0,
        preventiveMinutes:0,breakMinutes:0,meterLinkedOutput:0,
        weightedStandardUtilization:0,standardUtilizationWeight:0,
        weightedStandardSpeed:0,standardSpeedWeight:0,shiftNames:new Set<string>(),productCodes:new Set<string>()};grouped.set(key,item);}
      const totals=surveyTotals(row);
      item.shifts++;item.output+=row.outputQuantity;item.defects+=row.defectiveQuantity;
      item.startDelayMinutes+=row.startDelayMinutes;item.target+=row.targetQuantity||0;
      item.availableMinutes+=row.availableMinutes;item.downtimeMinutes+=totals.downtimeMinutes;
      item.productiveMinutes+=totals.productiveMinutes;item.repairMinutes+=row.repairMinutes;
      item.preventiveMinutes+=row.preventiveMinutes;item.breakMinutes+=row.breakMinutes;
      if(row.standardUtilizationPct!=null&&row.availableMinutes>0){
        item.weightedStandardUtilization+=row.standardUtilizationPct*row.availableMinutes;
        item.standardUtilizationWeight+=row.availableMinutes;
      }
      if(row.standardSpeed!=null&&totals.productiveMinutes>0){
        item.weightedStandardSpeed+=row.standardSpeed*totals.productiveMinutes;
        item.standardSpeedWeight+=totals.productiveMinutes;
      }
      if(row.meterReadingId)item.meterLinkedOutput+=row.outputQuantity;
      item.shiftNames.add(row.shift.name);if(row.productCode)item.productCodes.add(row.productCode);
    }
    // Query one aggregate baseline for all selected machine/unit pairs, so the cumulative
    // result includes approved output recorded before the visible date range.
    const earlier=await db.productionShiftRecord.groupBy({
      by:['assetId','unit'],
      where:{...getPlantFilterWhere(scope),...crewFilter,status:'approved',
        productionDate:{lt:first},...(assetId?{assetId}:{})},
      _sum:{outputQuantity:true},
    });
    const runningCumulative=new Map(earlier.map(x=>[x.assetId+'|'+x.unit,Number(x._sum.outputQuantity||0)]));
    // Maps are populated with planner shifts first and legacy/unplanned approved
    // records afterward, so insertion order is not always chronological.
    // Sort before rolling all-time cumulative output forward per machine/unit.
    const orderedGroups=[...grouped.values()].sort((a,b)=>
      a.period.localeCompare(b.period)||a.assetId.localeCompare(b.assetId)||a.unit.localeCompare(b.unit));
    const data=orderedGroups.map(({shiftNames,productCodes,weightedStandardUtilization,standardUtilizationWeight,
      weightedStandardSpeed,standardSpeedWeight,...item})=>{
      const key=item.assetId+'|'+item.unit;
      const cumulativeProduction=(runningCumulative.get(key)||0)+item.output;
      const planned=plannedByPeriod.get([item.period,item.assetId,item.unit].join('|'));
      const reportTarget=planned?.target??item.target;
      runningCumulative.set(key,cumulativeProduction);
      return {...item,cumulativeProduction,workbookCumulativeProduction:item.output,
        approvedOutputReported:item.shifts>0,
        target:reportTarget,plannedShifts:planned?.shifts??0,
        unapprovedOrMissingShifts:Math.max(0,(planned?.shifts??0)-item.shifts),
        shiftNames:[...shiftNames],productCodes:[...productCodes],
      goodOutput:item.output-item.defects,
      defectRatePct:item.output>0?100*item.defects/item.output:null,
      utilizationPct:item.availableMinutes>0?100*item.productiveMinutes/item.availableMinutes:null,
      standardUtilizationPct:standardUtilizationWeight>0?weightedStandardUtilization/standardUtilizationWeight:null,
      speedPerMinute:item.productiveMinutes>0?item.output/item.productiveMinutes:null,
      standardSpeedPerMinute:standardSpeedWeight>0?weightedStandardSpeed/standardSpeedWeight:null,
      productivityPerMinute:item.availableMinutes>0?item.output/item.availableMinutes:null,
      engineeringEfficiencyPct:item.availableMinutes>0?100*(item.availableMinutes-item.repairMinutes)/item.availableMinutes:null,
      targetAchievementPct:item.shifts>0&&reportTarget>0?100*item.output/reportTarget:null,
    };});
    return NextResponse.json({success:true,data,meta:{group,from,to,recordCount:records.length,
      truncated:false,plannedShiftCount:scheduled.length,
      note:'Only approved shift records are counted. Defects are included in gross output; good output excludes defects. No entry means no reported shift, not zero production.'}});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Could not create report'},{status:500});}
}