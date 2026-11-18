import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { requiresCrewScope } from '@/lib/production-shift-access';
import { allowedProductionMeter, allowedRuntimeMeter } from '@/lib/production-shift-survey';

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ success:false,error:'Not authenticated' },{status:401});
  if (!isAdmin(session) && !hasPermission(session,'production_surveys.view'))
    return NextResponse.json({ success:false,error:'Insufficient permissions' },{status:403});
  try {
    const params = new URL(request.url).searchParams;
    const assetId = params.get('assetId');
    if (!assetId) return NextResponse.json({ success:false,error:'Select a machine first' },{status:400});
    const scope = await getPlantScope(request,session);
    if (scope.denyAccess) return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const asset = await db.asset.findUnique({where:{id:assetId},select:{id:true,name:true,assetTag:true,plantId:true}});
    if (!asset) return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if (!canAccessPlantStrict(scope,asset.plantId)) return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const [shifts,allMeters] = await Promise.all([
      db.productionShiftTemplate.findMany({where:{plantId:asset.plantId,isActive:true},orderBy:[{sortOrder:'asc'},{name:'asc'}]}),
      db.assetMeter.findMany({where:{assetId:asset.id,isActive:true},select:{id:true,name:true,unit:true,meterType:true,currentValue:true},orderBy:{name:'asc'}}),
    ]);
    const date=params.get('date');
    let visibleShifts=shifts;
    if(requiresCrewScope(session)){
      if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
        Number.isNaN(new Date(date+'T00:00:00Z').getTime())||
        new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
        return NextResponse.json({success:false,error:'Select a valid production date to view assigned shifts'},{status:400});
      const plans=await db.productionShiftPlan.findMany({where:{assetId,productionDate:new Date(date+'T00:00:00Z'),
        crew:{some:{userId:session.userId}}},select:{shiftTemplateId:true}});
      const permitted=new Set(plans.map(x=>x.shiftTemplateId));
      visibleShifts=shifts.filter(shift=>permitted.has(shift.id));
    }
    return NextResponse.json({success:true,data:{asset,shifts:visibleShifts,meters:allMeters.filter(m=>allowedProductionMeter(m.meterType)),
      runtimeMeters:allMeters.filter(m=>allowedRuntimeMeter(m.meterType,m.unit))}});
  } catch (error) {return NextResponse.json({success:false,error:error instanceof Error?error.message:'Could not load shift setup'},{status:500});}
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if (!isAdmin(session) && !hasPermission(session,'production_surveys.manage') && !hasPermission(session,'production_surveys.plan'))
    return NextResponse.json({success:false,error:'Production management permission is required'},{status:403});
  try {
    const scope = await getPlantScope(request,session);
    if (scope.denyAccess) return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const body = await request.json() as Record<string,unknown>;
    const plantId = typeof body.plantId === 'string'?body.plantId.trim():'';
    if (!plantId) return NextResponse.json({success:false,error:'Plant is required'},{status:400});
    const plant = await db.plant.findUnique({where:{id:plantId},select:{id:true}});
    if (!plant) return NextResponse.json({success:false,error:'Plant not found'},{status:404});
    if (!canAccessPlantStrict(scope,plant.id)) return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    if (body.initialize === true) {
      await db.productionShiftTemplate.createMany({data:[
        {plantId,code:'morning',name:'Morning',sortOrder:10,createdById:session.userId},
        {plantId,code:'afternoon',name:'Afternoon',sortOrder:20,createdById:session.userId},
        {plantId,code:'night',name:'Night',sortOrder:30,createdById:session.userId},
      ],skipDuplicates:true});
      const shifts = await db.productionShiftTemplate.findMany({where:{plantId,isActive:true},orderBy:{sortOrder:'asc'}});
      return NextResponse.json({success:true,data:shifts});
    }
    const code = typeof body.code==='string'?body.code.trim().toLowerCase():'';
    const name = typeof body.name==='string'?body.name.trim():'';
    if (!/^[a-z][a-z0-9_-]{1,29}$/.test(code) || !name || name.length>80)
      return NextResponse.json({success:false,error:'A valid shift name and code are required'},{status:400});
    const startsAt = typeof body.startsAt==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.startsAt)?body.startsAt:null;
    const endsAt = typeof body.endsAt==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.endsAt)?body.endsAt:null;
    if(Boolean(startsAt)!==Boolean(endsAt)|| (startsAt&&startsAt===endsAt))
      return NextResponse.json({success:false,error:'Enter distinct shift start and end times together, or leave both blank'},{status:400});
    const shift=await db.productionShiftTemplate.create({data:{
      plantId,code,name,startsAt,endsAt,sortOrder:Number.isInteger(body.sortOrder)?Number(body.sortOrder):50,
      createdById:session.userId,
    }});
    return NextResponse.json({success:true,data:shift},{status:201});
  } catch(error) {
    const message=error instanceof Error?error.message:'Unable to configure shift';
    return NextResponse.json({success:false,error:/unique/i.test(message)?'Shift code already exists for this plant':message},{status:/unique/i.test(message)?409:500});
  }
}
