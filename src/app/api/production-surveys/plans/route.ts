import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

function parseDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Production date must be yyyy-mm-dd');
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid production date');
  return date;
}
function requiredNumber(value: unknown, label: string, min: number, max: number): number {
  if (value === '' || value == null || typeof value === 'boolean') throw new Error(label + ' is required');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(label + ' is out of range');
  return n;
}
const canView = (session: NonNullable<ReturnType<typeof getSession>>) =>
  isAdmin(session) || hasPermission(session, 'production_surveys.view');
const canPlan = (session: NonNullable<ReturnType<typeof getSession>>) =>
  isAdmin(session) || hasPermission(session, 'production_surveys.plan');

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({success:false,error:'Not authenticated'}, {status:401});
  if (!canView(session) && !canPlan(session)) return NextResponse.json({success:false,error:'Insufficient permissions'}, {status:403});
  try {
    const scope = await getPlantScope(request,session);
    if (scope.denyAccess) return NextResponse.json({success:false,error:'Forbidden'}, {status:403});
    const q = new URL(request.url).searchParams;
    const assetId = q.get('assetId');
    const productionDate = parseDate(q.get('date'));
    if (!assetId) return NextResponse.json({success:false,error:'Machine is required'}, {status:400});
    const asset = await db.asset.findUnique({where:{id:assetId},select:{id:true,plantId:true}});
    if (!asset) return NextResponse.json({success:false,error:'Machine not found'}, {status:404});
    if (!canAccessPlantStrict(scope,asset.plantId)) return NextResponse.json({success:false,error:'Forbidden'}, {status:403});
    const plans = await db.productionShiftPlan.findMany({where:{assetId,productionDate},orderBy:{createdAt:'asc'}});
    return NextResponse.json({success:true,data:plans});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read shift plans';
    return NextResponse.json({success:false,error:message}, {status:/date|required|invalid/i.test(message)?400:500});
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({success:false,error:'Not authenticated'}, {status:401});
  if (!canPlan(session)) return NextResponse.json({success:false,error:'Only planners may configure shift standards'}, {status:403});
  try {
    const body = await request.json() as Record<string, unknown>;
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
    const shiftTemplateId = typeof body.shiftTemplateId === 'string' ? body.shiftTemplateId.trim() : '';
    if (!assetId || !shiftTemplateId) return NextResponse.json({success:false,error:'Machine and shift are required'}, {status:400});
    const productionDate = parseDate(body.productionDate);
    const plannedShiftsPerDay = requiredNumber(body.plannedShiftsPerDay,'Shifts per day',1,8);
    if (!Number.isInteger(plannedShiftsPerDay)) throw new Error('Shifts per day must be an integer');
    const shiftHours = requiredNumber(body.shiftHours,'Shift hours',0.01,24);
    const availableMinutes = requiredNumber(body.availableMinutes,'Available minutes',0,1440);
    if (!Number.isInteger(availableMinutes) || availableMinutes > shiftHours*60) throw new Error('Available minutes must fit the shift hours');
    const targetQuantity = requiredNumber(body.targetQuantity,'Production target',0,1e12-1);
    const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
    if (!unit || unit.length>32 || !/^[a-zA-Z0-9°µ%/_ .-]+$/.test(unit)) throw new Error('Valid output unit is required');
    const standardUtilizationPct = body.standardUtilizationPct === '' || body.standardUtilizationPct == null ? null :
      requiredNumber(body.standardUtilizationPct,'Standard utilization',0,100);
    const standardSpeed = body.standardSpeed === '' || body.standardSpeed == null ? null :
      requiredNumber(body.standardSpeed,'Standard speed',0,1e12-1);
    const scope = await getPlantScope(request,session);
    if (scope.denyAccess) return NextResponse.json({success:false,error:'Forbidden'}, {status:403});
    const asset = await db.asset.findUnique({where:{id:assetId},select:{id:true,plantId:true}});
    if (!asset) return NextResponse.json({success:false,error:'Machine not found'}, {status:404});
    if (!canAccessPlantStrict(scope,asset.plantId)) return NextResponse.json({success:false,error:'Forbidden'}, {status:403});
    const shift = await db.productionShiftTemplate.findFirst({where:{id:shiftTemplateId,plantId:asset.plantId,isActive:true}});
    if (!shift) return NextResponse.json({success:false,error:'Shift does not belong to this plant'}, {status:400});

    const result = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',
        'iassetspro:production-plan:'+assetId+':'+productionDate.toISOString().slice(0,10)+':'+shiftTemplateId);
      const existingRecord = await tx.productionShiftRecord.findFirst({where:{assetId,productionDate,shiftTemplateId},select:{id:true}});
      if (existingRecord) throw new Error('A shift record already exists; its historical plan cannot be changed');
      const existing = await tx.productionShiftPlan.findUnique({
        where:{assetId_productionDate_shiftTemplateId:{assetId,productionDate,shiftTemplateId}}});
      const values = {plannedShiftsPerDay,shiftHours,availableMinutes,targetQuantity,unit,standardUtilizationPct,standardSpeed};
      const plan = existing ?
        await tx.productionShiftPlan.update({where:{id:existing.id},data:{...values,updatedById:session.userId}}) :
        await tx.productionShiftPlan.create({data:{plantId:asset.plantId,assetId,productionDate,shiftTemplateId,
          createdById:session.userId,...values}});
      await tx.auditLog.create({data:{userId:session.userId,action:existing?'update':'create',
        entityType:'production_shift_plan',entityId:plan.id,newValues:JSON.stringify(values),
        ...(existing?{oldValues:JSON.stringify(existing)}:{})}});
      return plan;
    },{timeout:15000});
    return NextResponse.json({success:true,data:result}, {status:200});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to configure production plan';
    return NextResponse.json({success:false,error:message},
      {status:/already exists|historical plan/.test(message)?409:/required|invalid|range|hours|unit|integer|shift/.test(message)?400:500});
  }
}
