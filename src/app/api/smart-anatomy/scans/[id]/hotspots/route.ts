import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { validatedScanPoint } from '@/lib/smart-anatomy/site-scan';
import {authorizedSiteScan, scanManager} from '@/lib/smart-anatomy/site-scan-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const bad=(status:number,error:string)=>NextResponse.json({success:false,error},{status});

export async function GET(req:NextRequest,{params}:Ctx){
  const session=getSession(req);
  if(!session)return bad(401,'Not authenticated');
  const manager=scanManager(session);
  if(!manager&&!hasPermission(session,'digital_twin.view'))return bad(403,'Insufficient permissions');
  const {id}=await params;
  const model=await authorizedSiteScan(req,id,session,manager);
  if(!model)return bad(404,'Authorized scan not found or not approved');
  const data=await db.siteScanHotspot.findMany({where:{
    modelId:id,assetId:model.assetId,...(manager?{}:{isApproved:true}),
  },select:{id:true,componentId:true,label:true,sourceMeshPath:true,
    positionX:true,positionY:true,positionZ:true,isApproved:true,
    createdById:true,reviewedById:true,createdAt:true,
    component:{select:{id:true,name:true,componentCode:true,lifecycleStatus:true}}},
    orderBy:{createdAt:'asc'},take:120});
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(req:NextRequest,{params}:Ctx){
  const session=getSession(req);
  if(!session)return bad(401,'Not authenticated');
  if(!scanManager(session))return bad(403,'Management permission required');
  const {id}=await params;
  const model=await authorizedSiteScan(req,id,session,true);
  if(!model)return bad(404,'Site scan not found in authorized plant');
  let body:Record<string,unknown>;
  try{body=await req.json() as Record<string,unknown>;}catch{return bad(400,'Invalid request');}
  const componentId=String(body.componentId||'');
  const label=String(body.label||'').trim();
  const sourceMeshPath=String(body.sourceMeshPath||'').trim();
  if(!componentId||componentId.length>100||label.length<2||label.length>140||
     sourceMeshPath.length>500||/[\x00-\x1f\x7f]/.test(label+sourceMeshPath))
    return bad(400,'Choose a registered component and factual short label');
  let point:ReturnType<typeof validatedScanPoint>;
  try{point=validatedScanPoint(body.position);}catch(e){
    return bad(400,e instanceof Error?e.message:'Invalid scan location');
  }
  const comp=await db.componentRegistry.findUnique({where:{id:componentId},
    select:{id:true,assetId:true}});
  if(!comp||comp.assetId!==model.assetId)
    return bad(409,'Selected component is not registered on this machine');
  const saved=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "asset_models" WHERE id = ${id} FOR UPDATE`;
    // Serialize with OEM/scan revision withdrawal; stale pre-lock checks
    // cannot approve or mutate a withdrawn scan.
    const withdrawn=await tx.auditLog.findFirst({
      where:{entityType:'asset_model',entityId:id,action:'withdraw'},
      select:{id:true},
    });
    if(withdrawn)return 'withdrawn' as const;
    if(await tx.siteScanHotspot.count({where:{modelId:id}})>=120)return null;
    const hotspot=await tx.siteScanHotspot.create({data:{
      modelId:id,assetId:model.assetId,componentId,label,
      sourceMeshPath:sourceMeshPath||null,
      positionX:point.x,positionY:point.y,positionZ:point.z,
      isApproved:false,createdById:session.userId,
    }});
    await tx.auditLog.create({data:{
      userId:session.userId,action:'create',entityType:'site_scan_hotspot',entityId:hotspot.id,
      newValues:JSON.stringify({modelId:id,componentId,label,point,
        sourceMeshPath:sourceMeshPath||null,evidence:'exterior-surface',approved:false}),
    }});
    return hotspot;
  });
  if(saved==='withdrawn')return bad(409,'Scan revision was withdrawn during marker placement');
  return saved?NextResponse.json({success:true,data:saved},{status:201}):
    bad(409,'Maximum 120 scan hotspots per model');
}

export async function DELETE(req:NextRequest,{params}:Ctx){
  const session=getSession(req);
  if(!session)return bad(401,'Not authenticated');
  if(!scanManager(session))return bad(403,'Management permission required');
  const {id}=await params;
  const model=await authorizedSiteScan(req,id,session,true);
  if(!model)return bad(404,'Site scan not found in authorized plant');
  let body:Record<string,unknown>;
  try{body=await req.json() as Record<string,unknown>;}catch{return bad(400,'Invalid request');}
  const hotspotId=String(body.hotspotId||''),reason=String(body.reason||'').trim();
  if(!hotspotId||reason.length<15||reason.length>500)return bad(400,'Explain marker withdrawal');
  const found=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "asset_models" WHERE id = ${id} FOR UPDATE`;
    // Serialize with OEM/scan revision withdrawal; stale pre-lock checks
    // cannot approve or mutate a withdrawn scan.
    const withdrawn=await tx.auditLog.findFirst({
      where:{entityType:'asset_model',entityId:id,action:'withdraw'},
      select:{id:true},
    });
    if(withdrawn)return 'withdrawn' as const;
    const current=await tx.siteScanHotspot.findFirst({where:{
      id:hotspotId,modelId:id,assetId:model.assetId,
    }});
    if(!current)return 'not-found' as const;
    // Approved spatial evidence is immutable even after scan withdrawal.
    // Corrections require a new scan revision and independent review.
    if(current.isApproved)return 'approved-immutable' as const;
    await tx.siteScanHotspot.delete({where:{id:hotspotId}});
    await tx.auditLog.create({data:{
      userId:session.userId,action:'delete',entityType:'site_scan_hotspot',entityId:hotspotId,
      oldValues:JSON.stringify(current),newValues:JSON.stringify({withdrawn:true,reason}),
    }});
    return true;
  });
  if(found==='withdrawn')return bad(409,'Scan revision was withdrawn during marker retraction');
  if(found==='approved-immutable')return bad(409,
    'Approved scan markers are immutable; withdraw the scan and import a corrected revision');
  if(found==='not-found')return bad(404,'Hotspot not found');
  return NextResponse.json({success:true,data:{retracted:true}});
}
