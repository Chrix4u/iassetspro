import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession,hasPermission,isAdmin } from '@/lib/auth';
import { getPlantScope,canAccessPlantStrict } from '@/lib/plant-scope';

const canPlan=(session:NonNullable<ReturnType<typeof getSession>>)=>isAdmin(session)||hasPermission(session,'production_surveys.plan');

export async function GET(request:NextRequest){
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!canPlan(session)&&!hasPermission(session,'production_surveys.view'))
    return NextResponse.json({success:false,error:'Forbidden'},{status:403});
  try{
    const assetId=new URL(request.url).searchParams.get('assetId');
    if(!assetId)return NextResponse.json({success:false,error:'Machine required'},{status:400});
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const asset=await db.asset.findUnique({where:{id:assetId},select:{plantId:true}});
    if(!asset)return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if(!canAccessPlantStrict(scope,asset.plantId))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    return NextResponse.json({success:true,data:await db.productionMachineProduct.findMany({
      where:{assetId,isActive:true},orderBy:{code:'asc'},take:300})});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Unable to list product codes'},{status:500});}
}

export async function POST(request:NextRequest){
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!canPlan(session))return NextResponse.json({success:false,error:'Planner permission required'},{status:403});
  try{
    const body=await request.json() as Record<string,unknown>;
    const assetId=typeof body.assetId==='string'?body.assetId.trim():'';
    const code=typeof body.code==='string'?body.code.trim().toUpperCase():'';
    const name=typeof body.name==='string'?body.name.trim():'';
    const unit=typeof body.unit==='string'?body.unit.trim():'';
    if(!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(code)||!name||name.length>160||
      !unit||unit.length>32||!/^[a-zA-Z0-9°µ%/_ .-]+$/.test(unit))
      return NextResponse.json({success:false,error:'Valid design code, description and production unit are required'},{status:400});
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const asset=await db.asset.findUnique({where:{id:assetId},select:{id:true,plantId:true}});
    if(!asset)return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if(!canAccessPlantStrict(scope,asset.plantId))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    // Existing codes may be renamed without altering historical shift plan snapshots.
    const product=await db.productionMachineProduct.upsert({
      where:{assetId_code:{assetId,code}},
      update:{name,unit,isActive:true},
      create:{plantId:asset.plantId,assetId,code,name,unit},
    });
    await db.auditLog.create({data:{userId:session.userId,action:'upsert',
      entityType:'production_machine_product',entityId:product.id,newValues:JSON.stringify({assetId,code,name,unit})}});
    return NextResponse.json({success:true,data:product});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Could not save product'},{status:500});}
}
