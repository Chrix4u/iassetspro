import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { canAccessPlantStrict,getPlantScope } from '@/lib/plant-scope';
import { allowedProductionMeter,parseProductionSurveyInput } from '@/lib/production-shift-survey';

// Only the original operator may correct a REJECTED shift.
// Approved production remains immutable; meter corrections need a separate audited adjustment.
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session)&&!hasPermission(session,'production_surveys.update'))
    return NextResponse.json({success:false,error:'Production entry permission is required'},{status:403});
  try {
    const {id}=await params;
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const original=await db.productionShiftRecord.findUnique({where:{id},select:{
      id:true,plantId:true,status:true,recordedById:true,meterReadingId:true,
    }});
    if(!original)return NextResponse.json({success:false,error:'Shift record not found'},{status:404});
    if(!canAccessPlantStrict(scope,original.plantId)||original.recordedById!==session.userId)
      return NextResponse.json({success:false,error:'Only the original operator may correct a rejected record'},{status:403});
    if(original.status!=='rejected'||original.meterReadingId)
      return NextResponse.json({success:false,error:'Only unposted, rejected records may be corrected'},{status:409});
    let parsed:ReturnType<typeof parseProductionSurveyInput>;
    try{parsed=parseProductionSurveyInput(await request.json());}
    catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Invalid correction'},{status:400});}
    const asset=await db.asset.findUnique({where:{id:parsed.assetId},select:{id:true,plantId:true}});
    if(!asset||asset.plantId!==original.plantId)
      return NextResponse.json({success:false,error:'Corrected machine must belong to the original plant'},{status:400});
    const shift=await db.productionShiftTemplate.findFirst({where:{
      id:parsed.shiftTemplateId,plantId:original.plantId,isActive:true,
    }});
    if(!shift)return NextResponse.json({success:false,error:'Shift is not configured for this plant'},{status:400});
    if(parsed.assetMeterId){
      const meter=await db.assetMeter.findFirst({where:{id:parsed.assetMeterId,assetId:asset.id,isActive:true}});
      if(!meter||!allowedProductionMeter(meter.meterType)||meter.unit!==parsed.unit)
        return NextResponse.json({success:false,error:'Production meter does not match machine or output unit'},{status:400});
    }
    const record=await db.$transaction(async(tx)=>{
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))','iassetspro:production-survey:'+id);
      const latest=await tx.productionShiftRecord.findUnique({where:{id}});
      if(!latest||latest.status!=='rejected'||latest.meterReadingId||latest.recordedById!==session.userId)
        throw new Error('Shift correction status changed; reload before editing');
      const updated=await tx.productionShiftRecord.update({where:{id},data:{
        ...parsed,status:'submitted',reviewNote:null,reviewedById:null,reviewedAt:null,
      }});
      await tx.auditLog.create({data:{userId:session.userId,action:'update',entityType:'production_shift_record',entityId:id,
        oldValues:JSON.stringify({assetId:latest.assetId,date:latest.productionDate,output:latest.outputQuantity,unit:latest.unit,
          status:latest.status,meterId:latest.assetMeterId}),
        newValues:JSON.stringify({assetId:updated.assetId,date:updated.productionDate,output:updated.outputQuantity,unit:updated.unit,
          status:updated.status,meterId:updated.assetMeterId})}});
      return updated;
    },{timeout:15000});
    return NextResponse.json({success:true,data:record});
  }catch(error){
    const message=error instanceof Error?error.message:'Failed to correct survey';
    return NextResponse.json({success:false,error:/P2002|Unique constraint/i.test(message)?
      'This machine already has a record for the selected shift and day':message},
      {status:/P2002|Unique constraint|status changed/i.test(message)?409:500});
  }
}
