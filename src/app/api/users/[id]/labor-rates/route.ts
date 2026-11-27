import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { buildAuditData } from '@/lib/audit-helpers';

const fail=(error:string,status:number)=>NextResponse.json({success:false,error},{status});
const ok=(data:unknown,status=200)=>NextResponse.json({success:true,data},{status});
type Params={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Params){
 try{
  const session=getSession(request);
  if(!session)return fail('Not authenticated',401);
  if(!isAdmin(session))return fail('Administrator access required',403);
  const {id}=await params;
  const scope=await getPlantScope(request,session);
  if(scope.denyAccess)return fail('Plant access denied',403);
  const user=await db.user.findUnique({where:{id},select:{id:true,plantAccess:{select:{plant:{select:{id:true,name:true,code:true,isActive:true}}}}}});
  if(!user)return fail('User not found',404);
  const plants=user.plantAccess.map(p=>p.plant).filter(p=>p.isActive&&canAccessPlantStrict(scope,p.id));
  const rates=await db.laborRate.findMany({where:{userId:id,plantId:{in:plants.map(p=>p.id)}},orderBy:{effectiveFrom:'desc'}});
  return ok({plants,rates});
 }catch{return fail('Unable to load labor rates',500);}
}
export async function POST(request:NextRequest,{params}:Params){
 try{
  const session=getSession(request);
  if(!session)return fail('Not authenticated',401);
  if(!isAdmin(session))return fail('Administrator access required',403);
  const {id}=await params;
  const body=await request.json();
  const {plantId,normalHourlyRate,overtimeHourlyRate}=body??{};
  const validRate=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1000000&&Math.abs(value*100-Math.round(value*100))<1e-7;
  if(typeof plantId!=='string'||!plantId||!validRate(normalHourlyRate)||(overtimeHourlyRate!=null&&!validRate(overtimeHourlyRate)))return fail('Select a plant and enter positive hourly rates with at most two decimal places',400);
  const scope=await getPlantScope(request,session);
  if(!canAccessPlantStrict(scope,plantId))return fail('Plant access denied',403);
  const result=await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))','labor-rate:'+id+':'+plantId);
   const membership=await tx.userPlant.findUnique({where:{userId_plantId:{userId:id,plantId}},select:{plant:{select:{isActive:true}},user:{select:{status:true}}}});
   if(!membership?.plant.isActive||membership.user.status!=='active')return {error:'Select an active user assigned to this active plant',status:400} as const;
   const now=new Date();
   const pending=await tx.laborRate.findFirst({where:{userId:id,plantId,effectiveFrom:{gt:now}}});
   if(pending)return {error:'A future-dated rate exists; resolve that rate before adding another',status:409} as const;
   const active=await tx.laborRate.findMany({where:{userId:id,plantId,effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gte:now}}]},take:2});
   if(active.length>1)return {error:'Overlapping historical rates need administrative reconciliation',status:409} as const;
   const previous=active[0];
   const overtime=overtimeHourlyRate??null;
   if(previous&&previous.normalHourlyRate===normalHourlyRate&&previous.overtimeHourlyRate===overtime&&previous.currency==='GHS')return {record:previous,status:200} as const;
   if(previous&&previous.currency!=='GHS')return {error:'The current rate uses a different currency; reconcile it before changing rates',status:409} as const;
   if(previous&&previous.effectiveFrom.getTime()>=now.getTime())return {error:'Rate changed concurrently; refresh and retry',status:409} as const;
   if(previous)await tx.laborRate.update({where:{id:previous.id},data:{effectiveTo:new Date(now.getTime()-1)}});
   const record=await tx.laborRate.create({data:{userId:id,plantId,normalHourlyRate,overtimeHourlyRate:overtime,effectiveFrom:now,currency:'GHS'}});
   await tx.auditLog.create({data:buildAuditData('create','labor_rate',record.id,session.userId,previous?{id:previous.id,normalHourlyRate:previous.normalHourlyRate,effectiveTo:previous.effectiveTo}:undefined,{userId:id,plantId,normalHourlyRate,overtimeHourlyRate:overtime,effectiveFrom:now,currency:'GHS'},{plantId})});
   return {record,status:201} as const;
  });
  if('error' in result)return fail(result.error!,result.status);
  return ok(result.record,result.status);
 }catch{return fail('Unable to save labor rate',500);}
}
