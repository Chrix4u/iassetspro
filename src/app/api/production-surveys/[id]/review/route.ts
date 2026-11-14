import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { canAccessPlantStrict,getPlantScope } from '@/lib/plant-scope';
import { allowedProductionMeter } from '@/lib/production-shift-survey';

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
        if(body.action==='approve')return {duplicate:true,record:row,meterPosted:Boolean(row.meterReadingId)};
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
        return {duplicate:false,record:rejected,meterPosted:false};
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
      const approved=await tx.productionShiftRecord.update({where:{id},data:{
        status:'approved',reviewedById:session.userId,reviewedAt:at,reviewNote:note,meterReadingId,
      }});
      await tx.auditLog.create({data:{userId:session.userId,action:'approve',entityType:'production_shift_record',entityId:id,
        newValues:JSON.stringify({approvedQuantity:row.outputQuantity,unit:row.unit,meterReadingId})}});
      return {duplicate:false,record:approved,meterPosted:Boolean(meterReadingId)};
    },{timeout:15000});
    return NextResponse.json({success:true,data:result});
  }catch(error){
    const msg=error instanceof Error?error.message:'Could not review shift';
    const status=/Only submitted|second person|not valid|baseline|decrease|reason|no longer available|approved production record/i.test(msg)?409:500;
    return NextResponse.json({success:false,error:msg},{status});
  }
}
