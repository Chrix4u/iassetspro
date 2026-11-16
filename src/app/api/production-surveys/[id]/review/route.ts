import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { canAccessPlantStrict,getPlantScope } from '@/lib/plant-scope';
import { allowedProductionMeter,allowedRuntimeMeter,validateVerifiedRuntimeCounter } from '@/lib/production-shift-survey';

// Review is the only code path that posts a survey to an asset's cumulative meter.
// Lock the review and meter inside one DB transaction, so repeated approvals cannot add output twice.
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session)&&!hasPermission(session,'production_surveys.manage'))
    return NextResponse.json({success:false,error:'A production manager must review shift figures'},{status:403});
  try {
    const {id}=await params;
    const body=await request.json() as {action?:string;note?:string};
    if(!['approve','reject'].includes(body.action||''))return NextResponse.json({success:false,error:'Select approve or reject'},{status:400});
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const scopeRecord=await db.productionShiftRecord.findUnique({where:{id},select:{plantId:true}});
    if(!scopeRecord)return NextResponse.json({success:false,error:'Shift entry not found'},{status:404});
    if(!canAccessPlantStrict(scope,scopeRecord.plantId))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const note=typeof body.note==='string'&&body.note.trim()?body.note.trim().slice(0,2000):null;
    if(body.action==='reject'&&!note)return NextResponse.json({success:false,error:'A rejection reason is required'},{status:400});
    const result=await db.$transaction(async(tx)=>{
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))','iassetspro:production-survey:'+id);
      const row=await tx.productionShiftRecord.findUnique({where:{id}});
      if(!row||row.plantId!==scopeRecord.plantId)throw new Error('Shift entry no longer available');
      if(row.status==='approved') {
        if(body.action==='approve')return {duplicate:true,record:row,meterPosted:Boolean(row.meterReadingId),
          runtimeMeterPosted:Boolean(row.runtimeMeterReadingId)};
        throw new Error('An approved production record cannot be rejected or rewritten');
      }
      if(row.status!=='submitted')throw new Error('Only submitted production shifts can be reviewed');
      if(row.recordedById===session.userId)throw new Error('A second person must verify the recorded production quantity');
      const at=new Date();
      if(body.action==='reject') {
        const rejected=await tx.productionShiftRecord.update({where:{id},data:{
          status:'rejected',reviewNote:note,reviewedById:session.userId,reviewedAt:at,
        }});
        await tx.auditLog.create({data:{userId:session.userId,action:'reject',entityType:'production_shift_record',entityId:id,newValues:JSON.stringify({reason:note})}});
        return {duplicate:false,record:rejected,meterPosted:false,runtimeMeterPosted:false};
      }
      let meterReadingId:string|null=null;
      if(row.assetMeterId) {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))','iassetspro:production-meter:'+row.assetMeterId);
        const meter=await tx.assetMeter.findUnique({where:{id:row.assetMeterId}});
        if(!meter||meter.assetId!==row.assetId||!meter.isActive||
           !allowedProductionMeter(meter.meterType)||meter.unit!==row.unit)
          throw new Error('Production meter is no longer valid for this machine and unit');
        const previousValue=Number(meter.currentValue);
        if(!Number.isFinite(previousValue)||previousValue<0)throw new Error('Meter baseline is invalid');
        const newValue=Math.round((previousValue+row.outputQuantity)*1e6)/1e6;
        if(!Number.isFinite(newValue)||newValue<previousValue)throw new Error('Cumulative meter would decrease or overflow');
        const reading=await tx.meterReading.create({data:{
          readingNumber:'MR-PRD-'+row.id,assetId:row.assetId,assetMeterId:meter.id,
          plantId:row.plantId,meterName:meter.name,unit:meter.unit,value:newValue,
          previousValue,consumption:row.outputQuantity,readingDate:at,
          notes:'Verified shift production; shift record '+row.id+' (field date '+row.productionDate.toISOString().slice(0,10)+')',
          readById:session.userId,
        }});
        await tx.assetMeter.update({where:{id:meter.id},data:{currentValue:newValue,lastReadingAt:at}});
        meterReadingId=reading.id;
      }
      // An optional, independently observed running-hour counter is approved separately,
      // atomically with output posting. Never substitute calculated productive minutes.
      let runtimeMeterReadingId:string|null=null;
      if(row.runtimeMeterId){
        if(row.runtimeCounterHours===null||!row.runtimeEvidence)
          throw new Error('Actual running hours and physical meter evidence are required');
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',
          'iassetspro:production-meter:'+row.runtimeMeterId);
        const runMeter=await tx.assetMeter.findUnique({where:{id:row.runtimeMeterId}});
        if(!runMeter||!runMeter.isActive||runMeter.assetId!==row.assetId||
           !allowedRuntimeMeter(runMeter.meterType,runMeter.unit))
          throw new Error('Operating-hours meter is invalid for this machine');
        const previousHours=Number(runMeter.currentValue);
        const observedHours=Number(row.runtimeCounterHours);
        const verifiedAdvanceHours=validateVerifiedRuntimeCounter({
          observed:observedHours,previous:previousHours,
          lastReadingAt:runMeter.lastReadingAt,recordedAt:row.createdAt,
        });
        const reading=await tx.meterReading.create({data:{
          readingNumber:'MR-RUN-'+row.id,assetId:row.assetId,assetMeterId:runMeter.id,
          plantId:row.plantId,meterName:runMeter.name,unit:runMeter.unit,value:observedHours,
          previousValue:previousHours,consumption:verifiedAdvanceHours,
          readingDate:at,readById:session.userId,
          notes:'Independently verified cumulative hour-meter: '+row.runtimeEvidence+
            ' (production shift '+row.id+'). Difference since prior meter reading may span multiple shifts.',
        }});
        await tx.assetMeter.update({where:{id:runMeter.id},data:{
          currentValue:observedHours,lastReadingAt:at,
        }});
        runtimeMeterReadingId=reading.id;
      }
      const approved=await tx.productionShiftRecord.update({where:{id},data:{
        status:'approved',reviewedById:session.userId,reviewedAt:at,reviewNote:note,meterReadingId,
        runtimeMeterReadingId,
      }});
      await tx.auditLog.create({data:{userId:session.userId,action:'approve',entityType:'production_shift_record',entityId:id,
        newValues:JSON.stringify({approvedQuantity:row.outputQuantity,unit:row.unit,meterReadingId,
          runtimeMeterReadingId,runtimeCounterHours:row.runtimeCounterHours})}});
      return {duplicate:false,record:approved,meterPosted:Boolean(meterReadingId),
        runtimeMeterPosted:Boolean(runtimeMeterReadingId)};
    },{timeout:15000});
    return NextResponse.json({success:true,data:result});
  }catch(error){
    const msg=error instanceof Error?error.message:'Could not review shift';
    const status=/Only submitted|second person|not valid|baseline|decrease|reason|no longer available|approved production record|hour-meter|Operating-hours meter|running hours/i.test(msg)?409:500;
    return NextResponse.json({success:false,error:msg},{status});
  }
}
