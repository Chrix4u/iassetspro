import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { canAccessPlantStrict,getPlantScope } from '@/lib/plant-scope';
import { requiresCrewScope } from '@/lib/production-shift-access';
import { allowedProductionMeter,allowedRuntimeMeter,parseProductionSurveyInput } from '@/lib/production-shift-survey';

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
      id:true,plantId:true,assetId:true,shiftTemplateId:true,productionDate:true,status:true,recordedById:true,meterReadingId:true,runtimeMeterReadingId:true,
    }});
    if(!original)return NextResponse.json({success:false,error:'Shift record not found'},{status:404});
    if(!canAccessPlantStrict(scope,original.plantId)||original.recordedById!==session.userId)
      return NextResponse.json({success:false,error:'Only the original operator may correct a rejected record'},{status:403});
    if(original.status!=='rejected'||original.meterReadingId||original.runtimeMeterReadingId)
      return NextResponse.json({success:false,error:'Only unposted, rejected records may be corrected'},{status:409});
    const raw=await request.json() as Record<string,unknown>;
    let parsed:ReturnType<typeof parseProductionSurveyInput>;
    try{parsed=parseProductionSurveyInput(raw);}
    catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Invalid correction'},{status:400});}
    // A correction edits measured values, never the scheduled machine/date/shift.
    // Moving a rejected record between plans could misattribute output or PM usage.
    if(parsed.assetId!==original.assetId||
       parsed.shiftTemplateId!==original.shiftTemplateId||
       parsed.productionDate.getTime()!==original.productionDate.getTime())
      return NextResponse.json({success:false,
        error:'Machine, production date and shift cannot be changed when correcting a rejected record'},
        {status:409});
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
      if(!latest||latest.status!=='rejected'||latest.meterReadingId||latest.runtimeMeterReadingId||latest.recordedById!==session.userId||
         latest.assetId!==original.assetId||latest.shiftTemplateId!==original.shiftTemplateId||
         latest.productionDate.getTime()!==original.productionDate.getTime())
        throw new Error('Shift correction status changed; reload before editing');
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',
        'iassetspro:production-plan:'+parsed.assetId+':'+parsed.productionDate.toISOString().slice(0,10)+':'+parsed.shiftTemplateId);
      const plan=await tx.productionShiftPlan.findUnique({where:{
        assetId_productionDate_shiftTemplateId:{assetId:parsed.assetId,productionDate:parsed.productionDate,
          shiftTemplateId:parsed.shiftTemplateId}}});
      if(!plan)throw new Error('Planner must configure this shift before it can be resubmitted');
      if(requiresCrewScope(session)){
        const assigned=await tx.productionShiftAssignment.findUnique({
          where:{planId_userId:{planId:plan.id,userId:session.userId}}});
        if(!assigned){
          // Legacy shift records predate crew rosters. The original recorder
          // may still correct a rejected record if no roster has ever existed.
          const assignedCount=await tx.productionShiftAssignment.count({where:{planId:plan.id}});
          if(assignedCount>0)
            throw new Error('You are no longer assigned to this shift; ask a planner to review the correction');
        }
      }
      const fromPlan=parseProductionSurveyInput({...raw,assetId:parsed.assetId,
        productionDate:parsed.productionDate.toISOString().slice(0,10),shiftTemplateId:parsed.shiftTemplateId,
        unit:plan.unit,targetQuantity:plan.targetQuantity,availableMinutes:plan.availableMinutes});
      if(fromPlan.assetMeterId){
        const meter=await tx.assetMeter.findFirst({where:{id:fromPlan.assetMeterId,assetId:parsed.assetId,isActive:true}});
        if(!meter||!allowedProductionMeter(meter.meterType)||meter.unit!==plan.unit)
          throw new Error('Select a production meter matching the planner-approved machine and unit');
      }
      if(fromPlan.runtimeMeterId){
        const runtimeMeter=await tx.assetMeter.findFirst({where:{
          id:fromPlan.runtimeMeterId,assetId:fromPlan.assetId,isActive:true,
        }});
        if(!runtimeMeter||!allowedRuntimeMeter(runtimeMeter.meterType,runtimeMeter.unit))
          throw new Error('Select an active operating-hours meter on this machine with hour units');
        if(fromPlan.runtimeMeterId===fromPlan.assetMeterId)
          throw new Error('Production and operating-hour meters must be different');
      }
      const updated=await tx.productionShiftRecord.update({where:{id},data:{
        ...fromPlan,planId:plan.id,productCode:plan.productCode,
        plannedShiftsPerDay:plan.plannedShiftsPerDay,shiftHours:plan.shiftHours,
        standardUtilizationPct:plan.standardUtilizationPct,standardSpeed:plan.standardSpeed,
        status:'submitted',reviewNote:null,reviewedById:null,reviewedAt:null,
      }});
      await tx.auditLog.create({data:{userId:session.userId,action:'update',entityType:'production_shift_record',entityId:id,
        oldValues:JSON.stringify({assetId:latest.assetId,date:latest.productionDate,output:latest.outputQuantity,unit:latest.unit,
          status:latest.status,meterId:latest.assetMeterId,
          runtimeMeterId:latest.runtimeMeterId,runtimeCounterHours:latest.runtimeCounterHours}),
        newValues:JSON.stringify({assetId:updated.assetId,date:updated.productionDate,output:updated.outputQuantity,unit:updated.unit,
          status:updated.status,meterId:updated.assetMeterId,defective:updated.defectiveQuantity,productCode:updated.productCode,
          runtimeMeterId:updated.runtimeMeterId,runtimeCounterHours:updated.runtimeCounterHours})}});
      return updated;
    },{timeout:15000});
    return NextResponse.json({success:true,data:record});
  }catch(error){
    const message=error instanceof Error?error.message:'Failed to correct survey';
    return NextResponse.json({success:false,error:/P2002|Unique constraint/i.test(message)?
      'This machine already has a record for the selected shift and day':message},
      {status:/P2002|Unique constraint|status changed/i.test(message)?409:/assigned|must|required|invalid/i.test(message)?400:500});
  }
}