import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { canCoordinateProduction, requiresCrewScope, validateCrewSelection } from '@/lib/production-shift-access';

function parseDate(value:unknown):Date {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Production date must be yyyy-mm-dd');
  const d=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error('Invalid production date');
  return d;
}
function number(value:unknown,label:string,min:number,max:number):number {
  if(value==null||value===''||typeof value==='boolean')throw new Error(label+' is required');
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max)throw new Error(label+' is out of range');
  return n;
}
const bad=(error:unknown)=>NextResponse.json({success:false,error:error instanceof Error?error.message:'Invalid plan'},{status:400});

export async function GET(request:NextRequest){
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session)&&!hasPermission(session,'production_surveys.view')&&!hasPermission(session,'production_surveys.plan'))
    return NextResponse.json({success:false,error:'Insufficient permissions'},{status:403});
  try{
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const q=new URL(request.url).searchParams;
    const assetId=q.get('assetId');
    if(!assetId)return NextResponse.json({success:false,error:'Machine is required'},{status:400});
    const asset=await db.asset.findUnique({where:{id:assetId},select:{id:true,plantId:true}});
    if(!asset)return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if(!canAccessPlantStrict(scope,asset.plantId))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const first=parseDate(q.get('from')||q.get('date'));
    const last=parseDate(q.get('to')||q.get('date'));
    if(last<first||(last.getTime()-first.getTime())/86400000>93)
      return NextResponse.json({success:false,error:'Select a date interval of up to 94 days'},{status:400});
    const plans=await db.productionShiftPlan.findMany({
      where:{assetId,productionDate:{gte:first,lte:last},
        ...(requiresCrewScope(session)?{OR:[
          {crew:{some:{userId:session.userId}}},
          // Keep original operators able to inspect legacy shifts recorded
          // before date-specific crew assignments existed.
          {records:{some:{recordedById:session.userId}}},
        ]}:{}),},
      include:{crew:{include:{user:{select:{id:true,fullName:true,username:true,staffId:true,status:true}}}}},
      orderBy:[{productionDate:'asc'},{createdAt:'asc'}],take:1000,
    });
    return NextResponse.json({success:true,data:plans});
  }catch(error){return bad(error);}
}

export async function POST(request:NextRequest){
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session)&&!hasPermission(session,'production_surveys.plan'))
    return NextResponse.json({success:false,error:'Planner permission is required'},{status:403});
  try{
    const body=await request.json() as Record<string,unknown>;
    const assetId=typeof body.assetId==='string'?body.assetId.trim():'';
    const shiftTemplateId=typeof body.shiftTemplateId==='string'?body.shiftTemplateId.trim():'';
    if(!assetId||!shiftTemplateId)throw new Error('Machine and shift are required');
    const first=parseDate(body.fromDate??body.productionDate);
    const last=parseDate(body.toDate??body.productionDate);
    if(last<first||(last.getTime()-first.getTime())/86400000>30)
      throw new Error('Schedule between 1 and 31 consecutive days at a time');
    const plannedShiftsPerDay=number(body.plannedShiftsPerDay,'Shifts per day',1,8);
    if(!Number.isInteger(plannedShiftsPerDay))throw new Error('Shifts per day must be a whole number');
    const shiftHours=number(body.shiftHours,'Shift hours',0.01,24);
    const availableMinutes=number(body.availableMinutes,'Available minutes',0,1440);
    if(!Number.isInteger(availableMinutes)||availableMinutes>shiftHours*60)
      throw new Error('Available minutes must fit within shift hours');
    const startsAt=typeof body.startsAt==='string'?body.startsAt.trim():'';
    const endsAt=typeof body.endsAt==='string'?body.endsAt.trim():'';
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endsAt)
      ||startsAt===endsAt)throw new Error('Specify distinct scheduled shift start and end times (HH:mm)');
    const [startH,startM]=startsAt.split(':').map(Number),[endH,endM]=endsAt.split(':').map(Number);
    const duration=((endH*60+endM)-(startH*60+startM)+1440)%1440;
    if(Math.abs(duration-shiftHours*60)>1)
      throw new Error('Scheduled shift start and end must match the planned shift hours');
    const plannedBreakMinutes=number(body.plannedBreakMinutes??0,'Planned break allowance',0,availableMinutes);
    if(!Number.isInteger(plannedBreakMinutes))throw new Error('Planned break allowance must be whole minutes');
    const targetQuantity=number(body.targetQuantity,'Production target',0,1e12-1);
    const unit=typeof body.unit==='string'?body.unit.trim():'';
    if(!unit||unit.length>32||!/^[a-zA-Z0-9°µ%/_ .-]+$/.test(unit))throw new Error('Valid output unit is required');
    const standardUtilizationPct=body.standardUtilizationPct===''||body.standardUtilizationPct==null
      ?null:number(body.standardUtilizationPct,'Standard utilization',0,100);
    const standardSpeed=body.standardSpeed===''||body.standardSpeed==null
      ?null:number(body.standardSpeed,'Standard speed',0,1e12-1);
    const productCode=typeof body.productCode==='string'?body.productCode.trim().toUpperCase():null;
    if(productCode&&(!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(productCode)))
      throw new Error('Invalid product/design code');
    const {userIds}=validateCrewSelection(body.crewUserIds);
    const leaderUserId=typeof body.leaderUserId==='string'?body.leaderUserId.trim():'';
    if(!userIds.includes(leaderUserId))throw new Error('Choose the team leader from the assigned crew');
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const asset=await db.asset.findUnique({where:{id:assetId},select:{id:true,plantId:true}});
    if(!asset)return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if(!canAccessPlantStrict(scope,asset.plantId))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const shift=await db.productionShiftTemplate.findFirst({where:{id:shiftTemplateId,plantId:asset.plantId,isActive:true}});
    if(!shift)throw new Error('Shift must be active and belong to the selected plant');
    // Only workers explicitly attached to the same plant are eligible, including
    // for planners who otherwise hold system-wide permissions.
    const employees=await db.user.findMany({where:{id:{in:userIds},status:'active',
      plantAccess:{some:{plantId:asset.plantId}}},select:{id:true}});
    if(employees.length!==userIds.length)throw new Error('All assigned workers must be active users of this plant');
    const products=await db.productionMachineProduct.findMany({where:{assetId,isActive:true},select:{code:true,unit:true}});
    if(products.length>0&&!productCode)throw new Error('Select the product/design code for this machine');
    if(productCode&&!products.some(p=>p.code===productCode&&p.unit===unit))
      throw new Error('Product/design code must be registered to the machine with the planned unit');
    const dates:Date[]=[];
    for(let time=first.getTime();time<=last.getTime();time+=86400000)dates.push(new Date(time));
    const result=await db.$transaction(async tx=>{
      const saved:Array<{id:string;assetId:string;productionDate:Date;shiftTemplateId:string}>=[];
      for(const productionDate of dates){
        const day=productionDate.toISOString().slice(0,10);
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',
          'iassetspro:production-plan:'+assetId+':'+day+':'+shiftTemplateId);
        const existingRecord=await tx.productionShiftRecord.findFirst({where:{assetId,productionDate,shiftTemplateId},select:{id:true}});
        if(existingRecord)throw new Error('Cannot change an already recorded shift: '+day);
        const existing=await tx.productionShiftPlan.findUnique({
          where:{assetId_productionDate_shiftTemplateId:{assetId,productionDate,shiftTemplateId}}});
        const values={plannedShiftsPerDay,shiftHours,availableMinutes,plannedBreakMinutes,startsAt,endsAt,
          targetQuantity,unit,productCode,standardUtilizationPct,standardSpeed};
        const plan=existing?await tx.productionShiftPlan.update({where:{id:existing.id},
          data:{...values,updatedById:session.userId}}):
          await tx.productionShiftPlan.create({data:{plantId:asset.plantId,assetId,productionDate,shiftTemplateId,
            createdById:session.userId,...values}});
        await tx.productionShiftAssignment.deleteMany({where:{planId:plan.id}});
        await tx.productionShiftAssignment.createMany({data:userIds.map(userId=>({
          planId:plan.id,userId,isLeader:userId===leaderUserId}))});
        await tx.auditLog.create({data:{userId:session.userId,action:existing?'update':'create',
          entityType:'production_shift_plan',entityId:plan.id,
          newValues:JSON.stringify({...values,date:day,crewUserIds:userIds,leaderUserId}),
          ...(existing?{oldValues:JSON.stringify(existing)}:{})}});
        saved.push(plan);
      }
      return saved;
    },{timeout:30000});
    return NextResponse.json({success:true,data:result,meta:{scheduledDays:result.length}});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to schedule shifts';
    const conflict=/Cannot change an already recorded|Unique constraint|P2002/.test(message);
    return NextResponse.json({success:false,error:message},{status:conflict?409:/valid|required|must|select|choose|schedule|out of range|assign|date|days|code|unit|worker|minutes|shift/i.test(message)?400:500});
  }
}
