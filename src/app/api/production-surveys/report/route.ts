import { NextRequest,NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { getPlantScope,getPlantFilterWhere } from '@/lib/plant-scope';
import { reportingWeekStart,surveyTotals } from '@/lib/production-shift-survey';

// Daily and Sunday-to-Saturday weekly summaries. Pending/unapproved output is excluded from PM and KPI totals.
export async function GET(request:NextRequest) {
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session)&&!hasPermission(session,'production_surveys.view'))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
  try{
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const q=new URL(request.url).searchParams;
    const group=q.get('group')==='week'?'week':'day';
    const today=new Date().toISOString().slice(0,10);
    const from=q.get('from')||new Date(Date.now()-6*86400000).toISOString().slice(0,10);
    const to=q.get('to')||today;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
      return NextResponse.json({success:false,error:'Dates must be yyyy-mm-dd'},{status:400});
    const first=new Date(from+'T00:00:00Z'),last=new Date(to+'T00:00:00Z');
    if(Number.isNaN(first.getTime())||Number.isNaN(last.getTime())||first>last||last.getTime()-first.getTime()>366*86400000)
      return NextResponse.json({success:false,error:'Report window must be 0–366 days'},{status:400});
    const assetId=q.get('assetId')||undefined;
    const where:Prisma.ProductionShiftRecordWhereInput={...getPlantFilterWhere(scope),status:'approved',
      productionDate:{gte:first,lte:last},...(assetId?{assetId}:{})};
    const records=await db.productionShiftRecord.findMany({where,include:{
      asset:{select:{name:true,assetTag:true,id:true}},shift:{select:{name:true,code:true}},
    },orderBy:[{productionDate:'asc'},{createdAt:'asc'}],take:20001});
    // Never return apparently authoritative production totals from a partial read.
    // Fetch one extra row to detect when a plant/date selection exceeds this bound.
    if(records.length>20000)return NextResponse.json({success:false,
      error:'More than 20,000 approved shifts match the report. Narrow the date range or select a machine; no partial totals were returned.',
      meta:{limit:20000,truncated:true}}, {status:422});
    const grouped=new Map<string,{period:string;assetId:string;machine:string;assetTag:string;unit:string;
      shifts:number;output:number;target:number;availableMinutes:number;downtimeMinutes:number;productiveMinutes:number;
      repairMinutes:number;preventiveMinutes:number;breakMinutes:number;meterLinkedOutput:number;shiftNames:Set<string>}>();
    for(const row of records){
      const period=group==='week'?reportingWeekStart(row.productionDate):row.productionDate.toISOString().slice(0,10);
      const key=[period,row.assetId,row.unit].join('|');
      let item=grouped.get(key);
      if(!item){item={period,assetId:row.assetId,machine:row.asset.name,assetTag:row.asset.assetTag,unit:row.unit,
        shifts:0,output:0,target:0,availableMinutes:0,downtimeMinutes:0,productiveMinutes:0,repairMinutes:0,
        preventiveMinutes:0,breakMinutes:0,meterLinkedOutput:0,shiftNames:new Set<string>()};grouped.set(key,item);}
      const totals=surveyTotals(row);
      item.shifts++;item.output+=row.outputQuantity;item.target+=row.targetQuantity||0;
      item.availableMinutes+=row.availableMinutes;item.downtimeMinutes+=totals.downtimeMinutes;
      item.productiveMinutes+=totals.productiveMinutes;item.repairMinutes+=row.repairMinutes;
      item.preventiveMinutes+=row.preventiveMinutes;item.breakMinutes+=row.breakMinutes;
      if(row.meterReadingId)item.meterLinkedOutput+=row.outputQuantity;
      item.shiftNames.add(row.shift.name);
    }
    const data=[...grouped.values()].map(({shiftNames,...item})=>({
      ...item,shiftNames:[...shiftNames],utilizationPct:item.availableMinutes>0?100*item.productiveMinutes/item.availableMinutes:null,
      speedPerMinute:item.productiveMinutes>0?item.output/item.productiveMinutes:null,
      targetAchievementPct:item.target>0?100*item.output/item.target:null,
    }));
    return NextResponse.json({success:true,data,meta:{group,from,to,recordCount:records.length,
      truncated:false,note:'Only approved shift records are counted. No entry means no reported shift, not zero production.'}});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Could not create report'},{status:500});}
}
