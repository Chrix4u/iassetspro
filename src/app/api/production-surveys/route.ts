import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { canAccessPlantStrict,getPlantFilterWhere,getPlantScope } from '@/lib/plant-scope';
import { allowedProductionMeter,parseProductionSurveyInput } from '@/lib/production-shift-survey';

const allowed = (session: NonNullable<ReturnType<typeof getSession>>) => isAdmin(session) || hasPermission(session,'production_surveys.view');
export async function GET(request:NextRequest) {
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!allowed(session))return NextResponse.json({success:false,error:'Insufficient permissions'},{status:403});
  try {
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const q=new URL(request.url).searchParams;
    const assetId=q.get('assetId')||undefined;
    const status=q.get('status')||undefined;
    if(status && !['submitted','approved','rejected'].includes(status))return NextResponse.json({success:false,error:'Invalid status'},{status:400});
    const from=q.get('from');const to=q.get('to');
    const parse=(value:string|null)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T00:00:00.000Z'):null;
    if((from&&!parse(from))||(to&&!parse(to)))return NextResponse.json({success:false,error:'Dates must use yyyy-mm-dd'},{status:400});
    const page=Math.max(1,Math.min(Number(q.get('page'))||1,100000));
    const limit=Math.max(1,Math.min(Number(q.get('limit'))||40,100));
    const where:Prisma.ProductionShiftRecordWhereInput={
      ...getPlantFilterWhere(scope),...(assetId?{assetId}:{}),...(status?{status}:{}),
      ...(from||to?{productionDate:{...(parse(from)?{gte:parse(from)!}:{}),...(parse(to)?{lte:parse(to)!}:{})}}:{}),
    };
    const [records,total]=await Promise.all([
      db.productionShiftRecord.findMany({where,include:{
        asset:{select:{id:true,name:true,assetTag:true}},shift:{select:{id:true,name:true,code:true}},
        recordedBy:{select:{id:true,fullName:true}},reviewedBy:{select:{id:true,fullName:true}},
        meter:{select:{id:true,name:true,unit:true}},
      },orderBy:[{productionDate:'desc'},{createdAt:'desc'}],skip:(page-1)*limit,take:limit}),
      db.productionShiftRecord.count({where}),
    ]);
    return NextResponse.json({success:true,data:records,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Could not load shift records'},{status:500});}
}
export async function POST(request:NextRequest) {
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session)&&!hasPermission(session,'production_surveys.create'))return NextResponse.json({success:false,error:'Production entry permission is required'},{status:403});
  try {
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const raw=await request.json() as Record<string,unknown>;
    const assetId=typeof raw.assetId==='string'?raw.assetId.trim():'';
    const shiftTemplateId=typeof raw.shiftTemplateId==='string'?raw.shiftTemplateId.trim():'';
    const productionDateText=typeof raw.productionDate==='string'?raw.productionDate:'';
    if(!assetId||!shiftTemplateId||!/^\d{4}-\d{2}-\d{2}$/.test(productionDateText))
      return NextResponse.json({success:false,error:'Machine, production date and shift are required'},{status:400});
    const productionDate=new Date(productionDateText+'T00:00:00.000Z');
    if(Number.isNaN(productionDate.getTime())||productionDate.toISOString().slice(0,10)!==productionDateText)
      return NextResponse.json({success:false,error:'Production date is invalid'},{status:400});
    const asset=await db.asset.findUnique({where:{id:assetId},select:{id:true,plantId:true}});
    if(!asset)return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if(!canAccessPlantStrict(scope,asset.plantId))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const shift=await db.productionShiftTemplate.findFirst({where:{id:shiftTemplateId,plantId:asset.plantId,isActive:true}});
    if(!shift)return NextResponse.json({success:false,error:'Shift is not configured for this plant'},{status:400});

    // Lock planner settings while creating the record. Never trust client-supplied targets or minutes.
    const record=await db.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',
        'iassetspro:production-plan:'+assetId+':'+productionDateText+':'+shiftTemplateId);
      const plan=await tx.productionShiftPlan.findUnique({
        where:{assetId_productionDate_shiftTemplateId:{assetId,productionDate,shiftTemplateId}}});
      if(!plan)throw new Error('Planner must configure this machine, date and shift before operators can report');
      const parsed=parseProductionSurveyInput({...raw,assetId,shiftTemplateId,productionDate:productionDateText,
        unit:plan.unit,targetQuantity:plan.targetQuantity,availableMinutes:plan.availableMinutes});
      if(parsed.assetMeterId){
        const meter=await tx.assetMeter.findFirst({where:{id:parsed.assetMeterId,assetId:asset.id,isActive:true}});
        if(!meter||!allowedProductionMeter(meter.meterType)||meter.unit!==plan.unit)
          throw new Error('Select an active production meter on this machine with the planner-approved unit');
      }
      const created=await tx.productionShiftRecord.create({data:{
        ...parsed,plantId:asset.plantId,recordedById:session.userId,status:'submitted',
        plannedShiftsPerDay:plan.plannedShiftsPerDay,shiftHours:plan.shiftHours,
        standardUtilizationPct:plan.standardUtilizationPct,standardSpeed:plan.standardSpeed,
      }});
      await tx.auditLog.create({data:{userId:session.userId,action:'create',entityType:'production_shift_record',entityId:created.id,
        newValues:JSON.stringify({assetId:created.assetId,shiftTemplateId:created.shiftTemplateId,date:created.productionDate,
          output:created.outputQuantity,unit:created.unit,target:created.targetQuantity,
          availableMinutes:created.availableMinutes,planId:plan.id,meterId:created.assetMeterId})}});
      return created;
    },{timeout:15000});
    return NextResponse.json({success:true,data:record},{status:201});
  }catch(error){
    const msg=error instanceof Error?error.message:'Could not submit survey';
    const duplicate=/Unique constraint|P2002/i.test(msg);
    const invalid=/Planner must configure|Select an active production meter|Production date|must be|stoppage|positive production|required|invalid/i.test(msg);
    return NextResponse.json({success:false,error:duplicate?'This machine already has a record for the selected shift and day':msg},
      {status:duplicate?409:invalid?400:500});
  }
}
