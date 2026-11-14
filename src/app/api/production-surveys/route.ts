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
    let parsed:ReturnType<typeof parseProductionSurveyInput>;
    try {parsed=parseProductionSurveyInput(await request.json());}
    catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Invalid survey'},{status:400});}
    const asset=await db.asset.findUnique({where:{id:parsed.assetId},select:{id:true,plantId:true}});
    if(!asset)return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if(!canAccessPlantStrict(scope,asset.plantId))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const shift=await db.productionShiftTemplate.findFirst({where:{id:parsed.shiftTemplateId,plantId:asset.plantId,isActive:true}});
    if(!shift)return NextResponse.json({success:false,error:'Shift is not configured for this plant'},{status:400});
    if(parsed.assetMeterId){
      const meter=await db.assetMeter.findFirst({where:{id:parsed.assetMeterId,assetId:asset.id,isActive:true}});
      if(!meter||!allowedProductionMeter(meter.meterType)||meter.unit!==parsed.unit)
        return NextResponse.json({success:false,error:'Select an active production meter on this machine with matching units'},{status:400});
    }
    // Entry and audit must commit together; a failed audit must not leave
    // a saved record that appears as a duplicate on operator retry.
    const record=await db.$transaction(async(tx)=>{
      const created=await tx.productionShiftRecord.create({data:{
        ...parsed,plantId:asset.plantId,recordedById:session.userId,status:'submitted',
      }});
      await tx.auditLog.create({data:{userId:session.userId,action:'create',entityType:'production_shift_record',entityId:created.id,
        newValues:JSON.stringify({assetId:created.assetId,shiftTemplateId:created.shiftTemplateId,date:created.productionDate,
          output:created.outputQuantity,unit:created.unit,meterId:created.assetMeterId})}});
      return created;
    });
    return NextResponse.json({success:true,data:record},{status:201});
  }catch(error){
    const msg=error instanceof Error?error.message:'Could not submit survey';
    return NextResponse.json({success:false,error:/Unique constraint|P2002/i.test(msg)?'This machine already has a record for the selected shift and day':msg},{status:/Unique constraint|P2002/i.test(msg)?409:500});
  }
}
